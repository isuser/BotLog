"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { boardViewQuery, parseBoardView, type BoardView } from "./board-view";

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
 * The board view's query (`?sort=…`, or ""), for links that open or close a task over the board
 * so its filters survive. Only the view's own parameters, normalized.
 */
export function useBoardQuery(): string {
  const searchParams = useSearchParams();
  return useMemo(() => boardViewQuery(parseBoardView(searchParams)), [searchParams]);
}
