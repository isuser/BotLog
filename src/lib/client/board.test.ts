import { describe, expect, test } from "vitest";
import {
  findColumn,
  flatten,
  groupByStatus,
  moveToColumn,
  placement,
  reorderInColumn,
  samePlacement,
  syncTask,
} from "./board";
import type { Task, TaskStatus } from "./types";

const task = (id: string, status: TaskStatus) => ({ id, status }) as Task;
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

const board = () =>
  groupByStatus([task("a", "backlog"), task("b", "backlog"), task("c", "todo"), task("d", "done")]);

describe("groupByStatus / flatten", () => {
  test("group in order and flatten back in board order", () => {
    const columns = board();
    expect(ids(columns.backlog)).toEqual(["a", "b"]);
    expect(columns.in_progress).toEqual([]);
    expect(ids(flatten(columns))).toEqual(["a", "b", "c", "d"]);
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
  test("inserts before the task it is over and updates the status", () => {
    const columns = moveToColumn(board(), "a", "c");
    expect(ids(columns.backlog)).toEqual(["b"]);
    expect(ids(columns.todo)).toEqual(["a", "c"]);
    expect(columns.todo[0].status).toBe("todo");
  });

  test("appends when over the column itself, including empty ones", () => {
    expect(ids(moveToColumn(board(), "a", "in_progress").in_progress)).toEqual(["a"]);
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
    expect(placement(columns, "b")).toEqual({ status: "backlog", after_id: "a" });
    expect(placement(columns, "a")).toEqual({ status: "backlog", before_id: "b" });
    expect(placement(columns, "c")).toEqual({ status: "todo" });
  });

  test("samePlacement detects drags that end where they started", () => {
    const columns = board();
    expect(samePlacement(columns, columns, "a")).toBe(true);
    expect(samePlacement(columns, reorderInColumn(columns, "a", "b"), "a")).toBe(false);
    expect(samePlacement(columns, moveToColumn(columns, "c", "done"), "c")).toBe(false);
  });
});

describe("syncTask", () => {
  const placed = (id: string, status: TaskStatus, position: string, archived = false) =>
    ({ id, status, position, archived_at: archived ? "2026-01-01T00:00:00Z" : null }) as Task;
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

  test("compares positions byte-wise, like the database", () => {
    // "Z" sorts before "a" in the C collation the position column uses.
    expect(ids(syncTask(tasks, placed("d", "backlog", "Zz")))).toEqual(["d", "a", "b", "c"]);
  });
});
