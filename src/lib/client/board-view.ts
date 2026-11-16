import { sortTasks } from "./task-sort";
import type { Task } from "./types";

/**
 * How the board is filtered and sorted. Visual only: it changes which of the loaded tasks each
 * column shows and in what order, never the tasks themselves. It lives in the URL, so a filtered
 * board can be shared, bookmarked and reloaded.
 */
export type BoardView = {
  sort: BoardSort;
  /** Label ids, or NONE for tasks without labels. Any of them matches. */
  labels: string[];
  /** Epic ids, or NONE for tasks without an epic. Any of them matches. */
  epics: string[];
  /** Any of them matches. */
  priorities: Task["priority"][];
};

/** Manual is the board's own (drag) order. ID sorts newest or oldest first; Priority, urgent first. */
export const BOARD_SORTS = ["manual", "newest", "oldest", "priority"] as const;
export type BoardSort = (typeof BOARD_SORTS)[number];

/** The sort menu's names for each sort, in menu order. */
export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  manual: "Manual",
  newest: "Newest first",
  oldest: "Oldest first",
  priority: "Priority",
};

/** Stands for "No labels" or "No epic" in a filter. */
export const NONE = "none";

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const satisfies readonly Task["priority"][];

export const DEFAULT_BOARD_VIEW: BoardView = { sort: "manual", labels: [], epics: [], priorities: [] };

// Query parameter names, e.g. ?sort=priority&labels=<id>,none&epic=<id>&priority=high,urgent
const PARAM = { sort: "sort", labels: "labels", epics: "epic", priorities: "priority" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Pick<URLSearchParams, "get">;

/** Comma-separated values, valid ones only, each once, in a fixed order so equal views give equal URLs. */
function list<T extends string>(params: Params, name: string, valid: (v: string) => v is T, order?: readonly T[]): T[] {
  const values = [...new Set((params.get(name) ?? "").split(",").map((v) => v.trim().toLowerCase()))].filter(valid);
  return order ? order.filter((v) => values.includes(v)) : values.sort();
}

const isSort = (v: string): v is BoardSort => (BOARD_SORTS as readonly string[]).includes(v);
const isPriority = (v: string): v is Task["priority"] => (PRIORITIES as readonly string[]).includes(v);
const isRef = (v: string): v is string => v === NONE || UUID.test(v);

/** Reads the view from a URL's query. Unknown or invalid values are dropped. */
export function parseBoardView(params: Params): BoardView {
  const sort = params.get(PARAM.sort)?.toLowerCase() ?? "";
  return {
    sort: isSort(sort) ? sort : DEFAULT_BOARD_VIEW.sort,
    labels: list(params, PARAM.labels, isRef),
    epics: list(params, PARAM.epics, isRef),
    priorities: list(params, PARAM.priorities, isPriority, PRIORITIES),
  };
}

/** The view as a query string with its leading `?`, or "" for the default view (a plain URL). */
export function boardViewQuery(view: BoardView): string {
  const params = new URLSearchParams();
  if (view.sort !== DEFAULT_BOARD_VIEW.sort) params.set(PARAM.sort, view.sort);
  if (view.labels.length) params.set(PARAM.labels, view.labels.join(","));
  if (view.epics.length) params.set(PARAM.epics, view.epics.join(","));
  if (view.priorities.length) params.set(PARAM.priorities, view.priorities.join(","));
  // Commas stay readable; ids and priorities never contain one.
  const query = params.toString().replaceAll("%2C", ",");
  return query ? `?${query}` : "";
}

export const isFiltered = (view: BoardView) =>
  view.labels.length > 0 || view.epics.length > 0 || view.priorities.length > 0;

/**
 * The tasks the view's filters let through, in the same order. Within one kind any value matches
 * (label A or B); across kinds all must (a matching label and a matching priority). Tasks in
 * `keep` always pass, like one just added that doesn't match, so it doesn't seem to vanish.
 */
export function filterTasks(tasks: Task[], view: BoardView, keep: readonly string[] = []): Task[] {
  if (!isFiltered(view)) return tasks;
  const { labels, epics, priorities } = view;
  return tasks.filter(
    (t) =>
      keep.includes(t.id) ||
      ((labels.length === 0 ||
        (t.labels.length === 0 ? labels.includes(NONE) : t.labels.some((l) => labels.includes(l.id)))) &&
      (epics.length === 0 || epics.includes(t.epic_id ?? NONE)) &&
      (priorities.length === 0 || priorities.includes(t.priority))),
  );
}

/**
 * The view without labels or epics the project no longer has (deleted, archived, or from another
 * project's link), so they neither hide every task nor count as picked. A list not loaded yet
 * (undefined) leaves its kind as is.
 */
export function pruneBoardView(view: BoardView, known: { labels?: readonly string[]; epics?: readonly string[] }): BoardView {
  const keep = (ids: string[], valid?: readonly string[]) =>
    valid ? ids.filter((id) => id === NONE || valid.includes(id)) : ids;
  const labels = keep(view.labels, known.labels);
  const epics = keep(view.epics, known.epics);
  return labels.length === view.labels.length && epics.length === view.epics.length ? view : { ...view, labels, epics };
}

/** The view with one value of a filter switched on or off, the kind's order kept canonical. */
export function toggleFilter<K extends "labels" | "epics" | "priorities">(
  view: BoardView,
  kind: K,
  value: BoardView[K][number],
): BoardView {
  const current = view[kind] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const ordered = kind === "priorities" ? PRIORITIES.filter((p) => next.includes(p)) : next.sort();
  return { ...view, [kind]: ordered };
}

/** The view with every filter off; the sort stays. */
export const clearFilters = (view: BoardView): BoardView => ({ ...view, labels: [], epics: [], priorities: [] });

/** One column's tasks in the view's order. Manual keeps the board order they come in. */
export function sortBoardTasks(tasks: Task[], sort: BoardSort): Task[] {
  switch (sort) {
    case "manual":
      return tasks;
    case "newest":
      return sortTasks(tasks, { key: "number", dir: "desc" });
    case "oldest":
      return sortTasks(tasks, { key: "number", dir: "asc" });
    case "priority":
      // Urgent first; equal priorities by task number.
      return sortTasks(tasks, { key: "priority", dir: "asc" });
  }
}

/** A column's tasks as the view shows them: filtered (tasks in `keep` always shown), then sorted. */
export const applyBoardView = (tasks: Task[], view: BoardView, keep: readonly string[] = []) =>
  sortBoardTasks(filterTasks(tasks, view, keep), view.sort);

/**
 * Remembering the view: each project's last view is kept in this browser's localStorage, as its
 * query without the `?`. A per-viewer convenience, never shared, so every read and write may fail
 * quietly (private windows, blocked storage).
 */
export const boardViewStorageKey = (projectId: string) => `botlog-board-view:${projectId}`;

type ViewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Reading `localStorage` itself can throw when storage is blocked, so it's looked up inside the try.
const browserStorage = (): ViewStorage => globalThis.localStorage;

/** The project's saved view query (`sort=…`), or null if there's none or storage can't be read. */
export function readSavedView(projectId: string, storage: () => ViewStorage = browserStorage): string | null {
  try {
    return storage().getItem(boardViewStorageKey(projectId)) || null;
  } catch {
    return null;
  }
}

/** Saves the project's view (a query from `boardViewQuery`); the default view ("") removes it. */
export function writeSavedView(projectId: string, query: string, storage: () => ViewStorage = browserStorage) {
  try {
    const key = boardViewStorageKey(projectId);
    if (query) storage().setItem(key, query.replace(/^\?/, ""));
    else storage().removeItem(key);
  } catch {
    // The view still applies; it just isn't remembered.
  }
}

/**
 * The query to restore from a saved view (`?…`, or "" for nothing), cleaned like a link's: invalid
 * values, and labels and epics the project no longer has, are dropped.
 */
export function savedViewQuery(
  saved: string | null,
  known: { labels?: readonly string[]; epics?: readonly string[] },
): string {
  if (!saved) return "";
  return boardViewQuery(pruneBoardView(parseBoardView(new URLSearchParams(saved)), known));
}
