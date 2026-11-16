"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { boardViewQuery, parseBoardView, readSavedView, savedViewQuery, writeSavedView, type BoardView } from "./board-view";

/**
 * The board's view from the URL, and a setter that replaces the URL's query (no new history
 * entry, no scroll). Reads search params, so the caller must sit inside a Suspense boundary.
 */
export function useBoardView(): [BoardView, (view: BoardView) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const view = useMemo(() => parseBoardView(searchParams), [searchParams]);
  const setView = useCallback(
    (next: BoardView) => router.replace(`${pathname}${boardViewQuery(next)}`, { scroll: false }),
    [pathname, router],
  );
  return [view, setView];
}

/**
 * The board's view, remembered per project in this browser. Every view shown is saved (the
 * default view removes the entry). Opening the board with a plain URL brings the saved view
 * back into the URL; a URL with a view always wins, so shared links show what was shared.
 *
 * `restoring` is true while a saved view may be on its way, so the board can wait rather than
 * flash every task first. The labels and epics lists are needed to drop ones the project no
 * longer has, so a restore waits for them; null means a list failed to load, and its kind is
 * restored as saved.
 */
export function useRememberedBoardView({
  projectId,
  labels,
  epics,
}: {
  projectId: string | undefined;
  labels: readonly string[] | null | undefined;
  epics: readonly string[] | null | undefined;
}): { view: BoardView; setView: (view: BoardView) => void; restoring: boolean } {
  const [view, replaceView] = useBoardView();
  const query = boardViewQuery(view);
  // The view this hook last put in the URL, by a change on the board or a restore. A plain URL
  // after "" means you cleared it; after anything else (or on opening), it's a plain link to the
  // board, like the Board tab, so the saved view comes back. The board stays mounted while other
  // tabs are open, which is why this can't be decided once on mount.
  const [own, setOwn] = useState<string | null>(null);
  // A new view in the URL (a link, or one this hook set) is followed, so a later plain URL
  // restores it. Only when the URL changes: a change just made on the board must not be
  // overwritten by the old URL before the new one arrives.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    if (query !== "") setOwn(query);
  }
  const restoring = query === "" && own !== "";

  const setView = useCallback(
    (next: BoardView) => {
      setOwn(boardViewQuery(next));
      replaceView(next);
    },
    [replaceView],
  );

  useEffect(() => {
    if (!projectId) return;
    if (query !== "") return writeSavedView(projectId, query);
    if (own === "") return writeSavedView(projectId, "");
    const saved = readSavedView(projectId);
    // Nothing to restore: the plain board is the view. Decided from browser storage, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!saved) return setOwn("");
    if (labels === undefined || epics === undefined) return; // Wait for them, to drop missing ones.
    const target = savedViewQuery(saved, { labels: labels ?? undefined, epics: epics ?? undefined });
    setOwn(target);
    if (target) replaceView(parseBoardView(new URLSearchParams(target)));
    else writeSavedView(projectId, "");
  }, [projectId, query, own, labels, epics, replaceView]);

  return { view, setView, restoring };
}

/**
 * The board view's query (`?sort=…`, or ""), for links that open or close a task over the board
 * so its filters survive. Only the view's own parameters, normalized.
 */
export function useBoardQuery(): string {
  const searchParams = useSearchParams();
  return useMemo(() => boardViewQuery(parseBoardView(searchParams)), [searchParams]);
}
