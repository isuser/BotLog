import { describe, expect, test } from "vitest";
import { nextSort, parseSort, sortByUrgency, sortTasks } from "./task-sort";
import type { Task } from "./types";

let n = 0;
const task = (fields: Partial<Task>): Task =>
  ({
    number: ++n,
    title: `Task ${n}`,
    status: "backlog",
    position: "a0",
    priority: "none",
    type: "feature",
    assignee: null,
    epic: null,
    due_date: null,
    updated_at: "2026-10-14T10:00:00Z",
    ...fields,
  }) as Task;

const titles = (tasks: Task[]) => tasks.map((t) => t.title);

describe("sortTasks", () => {
  test("status follows the board: column order, then position", () => {
    const tasks = [
      task({ title: "done", status: "done" }),
      task({ title: "todo b", status: "todo", position: "a2" }),
      task({ title: "backlog", status: "backlog" }),
      task({ title: "todo a", status: "todo", position: "a1" }),
    ];
    expect(titles(sortTasks(tasks, { key: "status", dir: "asc" }))).toEqual(["backlog", "todo a", "todo b", "done"]);
  });

  test("priority ascending puts urgent first; descending puts none first", () => {
    const tasks = [task({ title: "low", priority: "low" }), task({ title: "urgent", priority: "urgent" }), task({ title: "none" })];
    expect(titles(sortTasks(tasks, { key: "priority", dir: "asc" }))).toEqual(["urgent", "low", "none"]);
    expect(titles(sortTasks(tasks, { key: "priority", dir: "desc" }))).toEqual(["none", "low", "urgent"]);
  });

  test("missing due dates, epics and assignees sort last in both directions", () => {
    const tasks = [
      task({ title: "none" }),
      task({ title: "later", due_date: "2026-12-01" }),
      task({ title: "sooner", due_date: "2026-10-20" }),
    ];
    expect(titles(sortTasks(tasks, { key: "due_date", dir: "asc" }))).toEqual(["sooner", "later", "none"]);
    expect(titles(sortTasks(tasks, { key: "due_date", dir: "desc" }))).toEqual(["later", "sooner", "none"]);
  });

  test("titles compare case-insensitively and numbers naturally", () => {
    const tasks = [task({ title: "item 10" }), task({ title: "Item 2" }), task({ title: "alpha" })];
    expect(titles(sortTasks(tasks, { key: "title", dir: "asc" }))).toEqual(["alpha", "Item 2", "item 10"]);
  });

  test("ties keep task number order", () => {
    const tasks = [task({ title: "first", priority: "high" }), task({ title: "second", priority: "high" })];
    expect(titles(sortTasks(tasks.reverse(), { key: "priority", dir: "desc" }))).toEqual(["first", "second"]);
  });
});

describe("nextSort and parseSort", () => {
  test("flip the current column, start others ascending", () => {
    expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
    expect(nextSort({ key: "title", dir: "desc" }, "priority")).toEqual({ key: "priority", dir: "asc" });
  });

  test("fall back to board order for anything unrecognised", () => {
    expect(parseSort({ key: "priority", dir: "desc" })).toEqual({ key: "priority", dir: "desc" });
    expect(parseSort({ key: "nope", dir: "asc" })).toEqual({ key: "status", dir: "asc" });
    expect(parseSort(null)).toEqual({ key: "status", dir: "asc" });
  });
});

describe("sortByUrgency", () => {
  test("priority first, then due date (none last), then number", () => {
    const tasks = [
      task({ title: "low, due soon", priority: "low", due_date: "2026-10-15" }),
      task({ title: "high, no date", priority: "high" }),
      task({ title: "high, due later", priority: "high", due_date: "2026-11-01" }),
      task({ title: "high, due soon", priority: "high", due_date: "2026-10-20" }),
    ];
    expect(titles(sortByUrgency(tasks))).toEqual(["high, due soon", "high, due later", "high, no date", "low, due soon"]);
  });
});
