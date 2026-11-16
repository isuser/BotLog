import { describe, expect, test } from "vitest";
import {
  applyBoardView,
  boardViewQuery,
  clearFilters,
  DEFAULT_BOARD_VIEW,
  filterTasks,
  NONE,
  parseBoardView,
  pruneBoardView,
  sortBoardTasks,
  toggleFilter,
  type BoardView,
} from "./board-view";
import { groupByColumn, moveToColumn, placement, reorderInColumn } from "./board";
import type { Task } from "./types";

const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";
const E2 = "44444444-4444-4444-8444-444444444444";

const view = (fields: Partial<BoardView>): BoardView => ({ ...DEFAULT_BOARD_VIEW, ...fields });
const parse = (query: string) => parseBoardView(new URLSearchParams(query));

let n = 0;
const task = (fields: Partial<Omit<Task, "labels">> & { labels?: string[] } = {}): Task =>
  ({
    number: ++n,
    id: `task-${n}`,
    title: `Task ${n}`,
    priority: "none",
    epic_id: null,
    ...fields,
    labels: (fields.labels ?? []).map((id) => ({ id, name: id, color: "gray" })),
  }) as Task;
const titles = (tasks: Task[]) => tasks.map((t) => t.title);

describe("parseBoardView", () => {
  test("an empty query is the default view", () => {
    expect(parse("")).toEqual(DEFAULT_BOARD_VIEW);
  });

  test("reads every part", () => {
    expect(parse(`sort=priority&labels=${L1},${NONE}&epic=${E1}&priority=high,urgent`)).toEqual({
      sort: "priority",
      labels: [L1, NONE].sort(),
      epics: [E1],
      priorities: ["urgent", "high"],
    });
  });

  test("drops unknown or invalid values", () => {
    expect(parse(`sort=sideways&labels=bug,${L1},,&epic=x&priority=high,huge&other=1`)).toEqual(
      view({ labels: [L1], priorities: ["high"] }),
    );
  });

  test("ignores case and repeats", () => {
    expect(parse(`sort=NEWEST&labels=${L2.toUpperCase()},${L2}&priority=Low,low`)).toEqual(
      view({ sort: "newest", labels: [L2], priorities: ["low"] }),
    );
  });
});

describe("boardViewQuery", () => {
  test("the default view gives a plain URL", () => {
    expect(boardViewQuery(DEFAULT_BOARD_VIEW)).toBe("");
    expect(boardViewQuery(parse("sort=manual"))).toBe("");
  });

  test("writes only what differs from the default, with readable commas", () => {
    expect(boardViewQuery(view({ sort: "oldest" }))).toBe("?sort=oldest");
    expect(boardViewQuery(view({ labels: [L1, NONE], epics: [E1], priorities: ["urgent", "high"] }))).toBe(
      `?labels=${L1},none&epic=${E1}&priority=urgent,high`,
    );
  });

  test("round-trips through parseBoardView", () => {
    const v = view({ sort: "priority", labels: [L1, L2], epics: [NONE, E2].sort(), priorities: ["medium", "none"] });
    expect(parse(boardViewQuery(v).slice(1))).toEqual(v);
  });

  test("equal views give equal URLs, whatever order the query had", () => {
    expect(boardViewQuery(parse(`labels=${L2},${L1}&priority=low,urgent`))).toBe(
      boardViewQuery(parse(`priority=urgent,low&labels=${L1},${L2}`)),
    );
  });
});

describe("filterTasks", () => {
  const tasks = [
    task({ title: "a", labels: [L1], epic_id: E1, priority: "high" }),
    task({ title: "b", labels: [L2], epic_id: E2, priority: "low" }),
    task({ title: "c", labels: [L1, L2], priority: "urgent" }),
    task({ title: "d", priority: "high" }),
  ];

  test("no filters keeps every task, in order", () => {
    expect(filterTasks(tasks, DEFAULT_BOARD_VIEW)).toBe(tasks);
  });

  test("within one kind, any value matches", () => {
    expect(titles(filterTasks(tasks, view({ labels: [L1] })))).toEqual(["a", "c"]);
    expect(titles(filterTasks(tasks, view({ labels: [L1, L2] })))).toEqual(["a", "b", "c"]);
    expect(titles(filterTasks(tasks, view({ priorities: ["high", "urgent"] })))).toEqual(["a", "c", "d"]);
    expect(titles(filterTasks(tasks, view({ epics: [E1, E2] })))).toEqual(["a", "b"]);
  });

  test("across kinds, all must match", () => {
    expect(titles(filterTasks(tasks, view({ labels: [L1], priorities: ["high"] })))).toEqual(["a"]);
    expect(titles(filterTasks(tasks, view({ labels: [L2], epics: [E1] })))).toEqual([]);
  });

  test("tasks in keep always show, in their place", () => {
    const keep = [tasks[1].id];
    expect(titles(filterTasks(tasks, view({ priorities: ["urgent"] }), keep))).toEqual(["b", "c"]);
  });

  test("No labels and No epic", () => {
    expect(titles(filterTasks(tasks, view({ labels: [NONE] })))).toEqual(["d"]);
    expect(titles(filterTasks(tasks, view({ labels: [NONE, L2] })))).toEqual(["b", "c", "d"]);
    expect(titles(filterTasks(tasks, view({ epics: [NONE] })))).toEqual(["c", "d"]);
    expect(titles(filterTasks(tasks, view({ epics: [NONE, E1] })))).toEqual(["a", "c", "d"]);
  });
});

describe("sortBoardTasks", () => {
  const tasks = [
    task({ title: "3rd", number: 3, priority: "low" }),
    task({ title: "1st", number: 1, priority: "urgent" }),
    task({ title: "4th", number: 4, priority: "urgent" }),
    task({ title: "2nd", number: 2, priority: "none" }),
  ];

  test("manual keeps the board order", () => {
    expect(sortBoardTasks(tasks, "manual")).toBe(tasks);
  });

  test("by ID, newest or oldest first", () => {
    expect(titles(sortBoardTasks(tasks, "newest"))).toEqual(["4th", "3rd", "2nd", "1st"]);
    expect(titles(sortBoardTasks(tasks, "oldest"))).toEqual(["1st", "2nd", "3rd", "4th"]);
  });

  test("by priority, urgent first, then by ID", () => {
    expect(titles(sortBoardTasks(tasks, "priority"))).toEqual(["1st", "4th", "3rd", "2nd"]);
  });

  test("doesn't change the tasks it's given", () => {
    const before = titles(tasks);
    sortBoardTasks(tasks, "newest");
    expect(titles(tasks)).toEqual(before);
  });
});

test("applyBoardView filters, then sorts", () => {
  const tasks = [
    task({ title: "low", number: 10, priority: "low" }),
    task({ title: "skip", number: 11, priority: "none" }),
    task({ title: "high", number: 12, priority: "high" }),
  ];
  expect(titles(applyBoardView(tasks, view({ sort: "priority", priorities: ["high", "low"] })))).toEqual([
    "high",
    "low",
  ]);
});

describe("pruneBoardView", () => {
  const v = view({ labels: [L1, L2, NONE], epics: [E1, E2], priorities: ["high"] });

  test("drops labels and epics the project doesn't have, keeping none", () => {
    expect(pruneBoardView(v, { labels: [L1], epics: [E2] })).toEqual({ ...v, labels: [L1, NONE], epics: [E2] });
  });

  test("leaves a kind alone until its list has loaded", () => {
    expect(pruneBoardView(v, { labels: [L1] })).toEqual({ ...v, labels: [L1, NONE] });
    expect(pruneBoardView(v, {})).toBe(v);
  });

  test("returns the same view when nothing is dropped", () => {
    expect(pruneBoardView(v, { labels: [L1, L2], epics: [E1, E2] })).toBe(v);
  });
});

describe("toggleFilter / clearFilters", () => {
  test("adds and removes values, in canonical order", () => {
    const a = toggleFilter(DEFAULT_BOARD_VIEW, "labels", L2);
    const b = toggleFilter(a, "labels", L1);
    expect(b.labels).toEqual([L1, L2]);
    expect(toggleFilter(b, "labels", L2).labels).toEqual([L1]);
    const p = toggleFilter(toggleFilter(DEFAULT_BOARD_VIEW, "priorities", "low"), "priorities", "urgent");
    expect(p.priorities).toEqual(["urgent", "low"]);
  });

  test("toggling back gives the default URL again", () => {
    const on = toggleFilter(DEFAULT_BOARD_VIEW, "epics", NONE);
    expect(boardViewQuery(on)).toBe("?epic=none");
    expect(boardViewQuery(toggleFilter(on, "epics", NONE))).toBe("");
  });

  test("clearing keeps the sort", () => {
    const v = view({ sort: "priority", labels: [L1], epics: [E1], priorities: ["high"] });
    expect(clearFilters(v)).toEqual(view({ sort: "priority" }));
  });
});

/**
 * Dragging while filtered works on the full columns, with the drop target one of the visible
 * cards. The card should land between the visible cards around it, whatever is hidden.
 */
describe("drag and drop while filtered", () => {
  const card = (id: string, column: string, priority: Task["priority"]) =>
    ({ id, title: id, column_id: column, status: column === "todo" ? "todo" : "in_progress", priority, labels: [], epic_id: null }) as unknown as Task;
  // Showing high only: A, C, E are visible; b and d are hidden between them.
  const high = view({ priorities: ["high"] });
  const columns = () =>
    groupByColumn(
      [card("A", "todo", "high"), card("b", "todo", "low"), card("C", "todo", "high"), card("d", "todo", "low"), card("E", "todo", "high"), card("F", "doing", "high")],
      ["todo", "doing"],
    );
  const visible = (cols: ReturnType<typeof columns>, column: string) => titles(filterTasks(cols[column], high));

  test("down over a visible card: lands just below it", () => {
    const moved = reorderInColumn(columns(), "A", "C");
    expect(visible(moved, "todo")).toEqual(["C", "A", "E"]);
    expect(placement(moved, "A")).toEqual({ column_id: "todo", after_id: "C" });
  });

  test("up over a visible card: lands just above it", () => {
    const moved = reorderInColumn(columns(), "E", "C");
    expect(visible(moved, "todo")).toEqual(["A", "E", "C"]);
    const ids = moved.todo.map((t) => t.id);
    expect(ids.indexOf("E")).toBeLessThan(ids.indexOf("C"));
    expect(ids.indexOf("E")).toBeGreaterThan(ids.indexOf("A"));
  });

  test("into another column, over a visible card: lands just above it", () => {
    const moved = moveToColumn(columns(), "F", "C");
    expect(visible(moved, "todo")).toEqual(["A", "F", "C", "E"]);
  });
});
