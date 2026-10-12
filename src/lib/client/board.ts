import type { Task, TaskStatus } from "./types";

export const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "backlog", title: "Backlog" },
  { status: "todo", title: "To do" },
  { status: "in_progress", title: "In progress" },
  { status: "done", title: "Done" },
];

const STATUSES = COLUMNS.map((c) => c.status);

export type Columns = Record<TaskStatus, Task[]>;

const isStatus = (id: string): id is TaskStatus => (STATUSES as string[]).includes(id);

/** Groups tasks into columns, keeping their order (the API returns board order). */
export function groupByStatus(tasks: Task[]): Columns {
  const columns = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Columns;
  for (const task of tasks) columns[task.status].push(task);
  return columns;
}

export const flatten = (columns: Columns): Task[] => STATUSES.flatMap((s) => columns[s]);

/** The column a drag target belongs to: a column id itself, or the column holding a task. */
export function findColumn(columns: Columns, id: string): TaskStatus | null {
  if (isStatus(id)) return id;
  return STATUSES.find((s) => columns[s].some((t) => t.id === id)) ?? null;
}

/**
 * Moves a task into another column while dragging: before the task it is over, or to the
 * end when it is over the column itself.
 */
export function moveToColumn(columns: Columns, activeId: string, overId: string): Columns {
  const from = findColumn(columns, activeId);
  const to = findColumn(columns, overId);
  if (!from || !to || from === to) return columns;

  const task = columns[from].find((t) => t.id === activeId)!;
  const target = columns[to].filter((t) => t.id !== activeId);
  const overIndex = target.findIndex((t) => t.id === overId);
  const index = overIndex === -1 ? target.length : overIndex;

  return {
    ...columns,
    [from]: columns[from].filter((t) => t.id !== activeId),
    [to]: [...target.slice(0, index), { ...task, status: to }, ...target.slice(index)],
  };
}

/** Moves a task to where another task in the same column is. */
export function reorderInColumn(columns: Columns, activeId: string, overId: string): Columns {
  const status = findColumn(columns, activeId);
  if (!status || findColumn(columns, overId) !== status || activeId === overId) return columns;
  const items = [...columns[status]];
  const from = items.findIndex((t) => t.id === activeId);
  const to = items.findIndex((t) => t.id === overId);
  if (to === -1) return columns;
  const [task] = items.splice(from, 1);
  items.splice(to, 0, task);
  return { ...columns, [status]: items };
}

/**
 * Where a task sits, as the API's move body: its status and the task directly above it
 * (or below it when it is first). One neighbor is enough, and is robust to other changes
 * in the column since the board was loaded.
 */
export function placement(columns: Columns, taskId: string) {
  const status = findColumn(columns, taskId);
  if (!status) return null;
  const items = columns[status];
  const index = items.findIndex((t) => t.id === taskId);
  const above = items[index - 1];
  const below = items[index + 1];
  return {
    status,
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
