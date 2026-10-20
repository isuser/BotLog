import { describe, expect, test } from "vitest";
import {
  BOARD_COLUMNS,
  findColumn,
  flatten,
  groupByColumn,
  groupByStatus,
  inDoneWindow,
  moveToColumn,
  placement,
  reorderInColumn,
  samePlacement,
  syncTask,
  taskHref,
  visibleColumns,
} from "./board";
import type { Task, TaskStatus } from "./types";

// Columns keyed by id; here the ids double as readable names.
const COLUMN_STATUS: Record<string, TaskStatus> = { backlog: "backlog", todo: "todo", review: "in_progress", done: "done" };
const task = (id: string, column: string) => ({ id, column_id: column, status: COLUMN_STATUS[column] }) as Task;
const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const statusOf = (column: string) => COLUMN_STATUS[column];

const board = () =>
  groupByColumn(
    [task("a", "backlog"), task("b", "backlog"), task("c", "todo"), task("d", "done")],
    ["backlog", "todo", "review", "done"],
  );

describe("groupByColumn / groupByStatus / flatten", () => {
  test("group in column order and flatten back in board order", () => {
    const columns = board();
    expect(Object.keys(columns)).toEqual(["backlog", "todo", "review", "done"]);
    expect(ids(columns.backlog)).toEqual(["a", "b"]);
    expect(columns.review).toEqual([]);
    expect(ids(flatten(columns))).toEqual(["a", "b", "c", "d"]);
  });

  test("group by status for pages that show statuses", () => {
    const grouped = groupByStatus([task("a", "backlog"), task("r", "review")]);
    expect(ids(grouped.in_progress)).toEqual(["r"]);
    expect(Object.keys(grouped)).toEqual(["backlog", "todo", "in_progress", "done"]);
  });
});

describe("visibleColumns", () => {
  const columns = [
    { id: "backlog", kind: "backlog", hidden: false },
    { id: "todo", kind: "todo", hidden: true },
    { id: "review", kind: "custom", hidden: false },
    { id: "done", kind: "done", hidden: false },
  ] as const;

  test("leave out the Backlog and hidden columns", () => {
    expect(visibleColumns([...columns], { ...board(), todo: [] }).map((c) => c.id)).toEqual(["review", "done"]);
  });

  test("show a hidden column while it still has tasks", () => {
    expect(visibleColumns([...columns], board()).map((c) => c.id)).toEqual([
      "todo",
      "review",
      "done",
    ]);
  });
});

describe("findColumn", () => {
  test("finds columns by id or by task", () => {
    expect(findColumn(board(), "todo")).toBe("todo");
    expect(findColumn(board(), "b")).toBe("backlog");
    expect(findColumn(board(), "zzz")).toBeNull();
  });
});

describe("moveToColumn", () => {
  test("inserts before the task it is over and updates the column and status", () => {
    const columns = moveToColumn(board(), "a", "c", statusOf);
    expect(ids(columns.backlog)).toEqual(["b"]);
    expect(ids(columns.todo)).toEqual(["a", "c"]);
    expect(columns.todo[0]).toMatchObject({ column_id: "todo", status: "todo" });
  });

  test("appends when over the column itself, including empty ones", () => {
    const moved = moveToColumn(board(), "a", "review", statusOf);
    expect(ids(moved.review)).toEqual(["a"]);
    expect(moved.review[0]).toMatchObject({ column_id: "review", status: "in_progress" });
    expect(ids(moveToColumn(board(), "a", "todo").todo)).toEqual(["c", "a"]);
  });

  test("does nothing within the same column", () => {
    const columns = board();
    expect(moveToColumn(columns, "a", "b")).toBe(columns);
  });
});

describe("reorderInColumn", () => {
  test("moves a task to the other task's spot", () => {
    expect(ids(reorderInColumn(board(), "a", "b").backlog)).toEqual(["b", "a"]);
    expect(ids(reorderInColumn(board(), "b", "a").backlog)).toEqual(["b", "a"]);
  });
});

describe("placement", () => {
  test("uses the task above, or below when first, or nothing when alone", () => {
    const columns = board();
    expect(placement(columns, "b")).toEqual({ column_id: "backlog", after_id: "a" });
    expect(placement(columns, "a")).toEqual({ column_id: "backlog", before_id: "b" });
    expect(placement(columns, "c")).toEqual({ column_id: "todo" });
  });

  test("samePlacement detects drags that end where they started", () => {
    const columns = board();
    expect(samePlacement(columns, columns, "a")).toBe(true);
    expect(samePlacement(columns, reorderInColumn(columns, "a", "b"), "a")).toBe(false);
    expect(samePlacement(columns, moveToColumn(columns, "c", "done"), "c")).toBe(false);
  });
});

describe("syncTask", () => {
  const placed = (id: string, status: TaskStatus, position: string, archived = false, column = status as string) =>
    ({ id, status, column_id: column, position, archived_at: archived ? "2026-01-01T00:00:00Z" : null }) as Task;
  const tasks = [placed("a", "backlog", "a0"), placed("b", "backlog", "a1"), placed("c", "done", "a0")];

  test("replaces a task in place when its position is unchanged", () => {
    const updated = { ...tasks[1], title: "New title" };
    const result = syncTask(tasks, updated);
    expect(ids(result)).toEqual(["a", "b", "c"]);
    expect(result[1]).toBe(updated);
  });

  test("moves a task to its new column and position", () => {
    expect(ids(syncTask(tasks, placed("a", "done", "Zz")))).toEqual(["b", "a", "c"]);
    expect(ids(syncTask(tasks, placed("c", "backlog", "a0V")))).toEqual(["a", "c", "b"]);
  });

  test("adds a new task and drops an archived one", () => {
    expect(ids(syncTask(tasks, placed("d", "todo", "a0")))).toEqual(["a", "b", "d", "c"]);
    expect(ids(syncTask(tasks, placed("b", "backlog", "a1", true)))).toEqual(["a", "c"]);
  });

  test("orders columns of the same status by column, like the API", () => {
    const inProgress = [placed("x", "in_progress", "a0", false, "c2"), placed("y", "in_progress", "a0", false, "c9")];
    expect(ids(syncTask(inProgress, placed("z", "in_progress", "Zz", false, "c5")))).toEqual(["x", "z", "y"]);
  });

  test("compares positions byte-wise, like the database", () => {
    // "Z" sorts before "a" in the C collation the position column uses.
    expect(ids(syncTask(tasks, placed("d", "backlog", "Zz")))).toEqual(["d", "a", "b", "c"]);
  });
});

describe("board columns", () => {
  test("leave the backlog to its own tab", () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual(["todo", "in_progress", "done"]);
  });
});

describe("inDoneWindow", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  test("keeps tasks finished within the window", () => {
    expect(inDoneWindow({ done_at: "2026-10-02T12:00:01Z" }, 14, now)).toBe(true);
    expect(inDoneWindow({ done_at: "2026-10-01T12:00:00Z" }, 14, now)).toBe(false);
    expect(inDoneWindow({ done_at: "2026-10-14T12:00:00Z" }, 1, now)).toBe(false);
  });
  test("keeps a task just dropped into Done, before the API sets done_at", () => {
    expect(inDoneWindow({ done_at: null }, 1, now)).toBe(true);
  });
});

describe("taskHref", () => {
  const t = { project_key: "BOT", short_id: "BOT-1" };
  test("opens over the board, backlog or list", () => {
    expect(taskHref(t)).toBe("/projects/BOT/tasks/BOT-1");
    expect(taskHref(t, "backlog")).toBe("/projects/BOT/backlog/tasks/BOT-1");
    expect(taskHref(t, "list")).toBe("/projects/BOT/list/tasks/BOT-1");
  });
});
