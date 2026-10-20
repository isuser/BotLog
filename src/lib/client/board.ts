import type { BoardColumn, Task, TaskStatus } from "./types";

export const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "backlog", title: "Backlog" },
  { status: "todo", title: "To do" },
  { status: "in_progress", title: "In progress" },
  { status: "done", title: "Done" },
];

const STATUSES = COLUMNS.map((c) => c.status);

/** The board's columns. The backlog has its own tab, so a long one doesn't crowd the board. */
export const BOARD_COLUMNS = COLUMNS.filter((c) => c.status !== "backlog");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a Done task is still inside the project's Done window, so it shows on the board.
 * One without `done_at` was just dropped into Done here and hasn't been saved yet.
 */
export function inDoneWindow(task: Pick<Task, "done_at">, windowDays: number, now: number): boolean {
  return !task.done_at || now - Date.parse(task.done_at) < windowDays * DAY_MS;
}

/**
 * Tasks grouped into columns, keyed by column id (or by status, for pages grouped by
 * status). Keys are in board order.
 */
export type Columns = Record<string, Task[]>;

/** Groups tasks by status, keeping their order (the API returns board order). */
export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const columns = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const task of tasks) columns[task.status].push(task);
  return columns;
}

/** Groups tasks by column, in the order of `columnIds` (every column of the project). */
export function groupByColumn(tasks: Task[], columnIds: string[]): Columns {
  const columns: Columns = Object.fromEntries(columnIds.map((id) => [id, [] as Task[]]));
  for (const task of tasks) (columns[task.column_id] ??= []).push(task);
  return columns;
}

/**
 * The columns the board shows, in order: everything but the Backlog (it has its own tab) and
 * hidden columns, unless a hidden one still holds tasks (an agent moved one there by status).
 */
export function visibleColumns<C extends Pick<BoardColumn, "id" | "kind" | "hidden">>(columns: C[], grouped: Columns): C[] {
  return columns.filter((c) => c.kind !== "backlog" && (!c.hidden || (grouped[c.id]?.length ?? 0) > 0));
}

export const flatten = (columns: Columns): Task[] => Object.values(columns).flat();

/** The column a drag target belongs to: a column id itself, or the column holding a task. */
export function findColumn(columns: Columns, id: string): string | null {
  if (Object.hasOwn(columns, id)) return id;
  return Object.keys(columns).find((key) => columns[key].some((t) => t.id === id)) ?? null;
}

/**
 * Moves a task into another column while dragging: before the task it is over, or to the
 * end when it is over the column itself. `statusOf` gives the status the target column
 * counts as, so the card shows it before the API answers.
 */
export function moveToColumn(
  columns: Columns,
  activeId: string,
  overId: string,
  statusOf: (columnId: string) => TaskStatus | undefined = () => undefined,
): Columns {
  const from = findColumn(columns, activeId);
  const to = findColumn(columns, overId);
  if (!from || !to || from === to) return columns;

  const task = columns[from].find((t) => t.id === activeId)!;
  const target = columns[to].filter((t) => t.id !== activeId);
  const overIndex = target.findIndex((t) => t.id === overId);
  const index = overIndex === -1 ? target.length : overIndex;
  const moved = { ...task, column_id: to, status: statusOf(to) ?? task.status };

  return {
    ...columns,
    [from]: columns[from].filter((t) => t.id !== activeId),
    [to]: [...target.slice(0, index), moved, ...target.slice(index)],
  };
}

/** Moves a task to where another task in the same column is. */
export function reorderInColumn(columns: Columns, activeId: string, overId: string): Columns {
  const column = findColumn(columns, activeId);
  if (!column || findColumn(columns, overId) !== column || activeId === overId) return columns;
  const items = [...columns[column]];
  const from = items.findIndex((t) => t.id === activeId);
  const to = items.findIndex((t) => t.id === overId);
  if (to === -1) return columns;
  const [task] = items.splice(from, 1);
  items.splice(to, 0, task);
  return { ...columns, [column]: items };
}

/**
 * Where a task sits, as the API's move body: its column and the task directly above it
 * (or below it when it is first). One neighbor is enough, and is robust to other changes
 * in the column since the board was loaded.
 */
export function placement(columns: Columns, taskId: string) {
  const column = findColumn(columns, taskId);
  if (!column) return null;
  const items = columns[column];
  const index = items.findIndex((t) => t.id === taskId);
  const above = items[index - 1];
  const below = items[index + 1];
  return {
    column_id: column,
    ...(above ? { after_id: above.id } : below ? { before_id: below.id } : {}),
  };
}

/** Whether a drag ended where it started. */
export function samePlacement(before: Columns, after: Columns, taskId: string): boolean {
  const a = placement(before, taskId);
  const b = placement(after, taskId);
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Replaces one task with the API's latest version of it. */
export const replaceTask = (tasks: Task[], task: Task) => tasks.map((t) => (t.id === task.id ? task : t));

const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s, i])) as Record<TaskStatus, number>;

/** Board order, as the API sorts it: status, column, position, then id. */
function compareBoardOrder(a: Task, b: Task): number {
  if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (a.column_id !== b.column_id) return a.column_id < b.column_id ? -1 : 1;
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Puts the API's latest version of a task where it belongs on the board (its status or
 * position may have changed), adds it if it is new, and drops it once it is archived.
 */
export function syncTask(tasks: Task[], task: Task): Task[] {
  const rest = tasks.filter((t) => t.id !== task.id);
  if (task.archived_at) return rest;
  const index = rest.findIndex((t) => compareBoardOrder(task, t) < 0);
  return index === -1 ? [...rest, task] : [...rest.slice(0, index), task, ...rest.slice(index)];
}

/** Which project page a task panel opens over. */
export type TaskView = "board" | "backlog" | "list";

/** A task's URL, open over its project's board (the shareable link), backlog or list. */
export const taskHref = (task: Pick<Task, "project_key" | "short_id">, view: TaskView = "board") =>
  `/projects/${task.project_key}${view === "board" ? "" : `/${view}`}/tasks/${task.short_id}`;
