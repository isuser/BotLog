import { COLUMNS } from "./board";
import type { Task } from "./types";

export const SORT_KEYS = ["number", "title", "status", "priority", "type", "assignee", "epic", "due_date", "updated_at"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const DEFAULT_SORT: Sort = { key: "status", dir: "asc" };

const STATUS_ORDER = Object.fromEntries(COLUMNS.map((c, i) => [c.status, i])) as Record<Task["status"], number>;
const PRIORITY_ORDER: Record<Task["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const TYPE_ORDER: Record<Task["type"], number> = { bug: 0, feature: 1, improvement: 2 };

const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/**
 * Each column's comparison, ascending. Values a task can lack (assignee, epic, due date) return
 * null and always sort last, whichever the direction.
 */
const VALUE: Record<SortKey, (t: Task) => string | number | null> = {
  number: (t) => t.number,
  title: (t) => t.title,
  // Board order: column, then position within it.
  // By status, then each column's tasks together, in board order.
  status: (t) => `${STATUS_ORDER[t.status]}:${t.column_id}:${t.position}`,
  // Most urgent first when ascending.
  priority: (t) => PRIORITY_ORDER[t.priority],
  type: (t) => TYPE_ORDER[t.type],
  assignee: (t) => t.assignee?.name || (t.assignee?.type === "user" ? t.assignee.email : null) || null,
  epic: (t) => t.epic?.title ?? null,
  due_date: (t) => t.due_date,
  updated_at: (t) => t.updated_at,
};

function compareValues(a: string | number, b: string | number, key: SortKey) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // Status sorts by position strings, which are byte-ordered (collate "C"), not by locale.
  if (key === "status") return a < b ? -1 : a > b ? 1 : 0;
  return text(String(a), String(b));
}

/** A sorted copy of `tasks`. Ties fall back to the task number, so the order is stable. */
export function sortTasks(tasks: Task[], { key, dir }: Sort): Task[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...tasks].sort((x, y) => {
    const a = VALUE[key](x);
    const b = VALUE[key](y);
    if (a === null || b === null) {
      if (a !== b) return a === null ? 1 : -1;
    } else {
      const result = compareValues(a, b, key);
      if (result !== 0) return result * sign;
    }
    return x.number - y.number;
  });
}

/** Clicking the current column flips its direction; another column starts ascending. */
export const nextSort = (current: Sort, key: SortKey): Sort =>
  current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };

export function parseSort(value: unknown): Sort {
  const v = value as Partial<Sort> | null;
  return v && SORT_KEYS.includes(v.key as SortKey) && (v.dir === "asc" || v.dir === "desc")
    ? { key: v.key as SortKey, dir: v.dir }
    : DEFAULT_SORT;
}

/** My tasks order: most urgent first, then soonest due (no date last), then task number. */
export function sortByUrgency(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
      a.number - b.number,
  );
}
