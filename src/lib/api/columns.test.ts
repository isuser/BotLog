import { expect, test } from "vitest";
import { type Column, columnPosition } from "./columns";

const column = (id: string, kind: string, position: string) => ({ id, kind, position }) as Column;
const columns = [
  column("b", "backlog", "a0"),
  column("t", "todo", "a1"),
  column("p", "in_progress", "a2"),
  column("d", "done", "a3"),
];

test("new columns go just before Done by default", () => {
  const position = columnPosition(columns, {});
  expect(position > "a2" && position < "a3").toBe(true);
});

test("after_id and before_id place a column next to another", () => {
  const afterTodo = columnPosition(columns, { afterId: "t" });
  expect(afterTodo > "a1" && afterTodo < "a2").toBe(true);
  const beforeTodo = columnPosition(columns, { beforeId: "t" });
  expect(beforeTodo > "a0" && beforeTodo < "a1").toBe(true);
  const between = columnPosition(columns, { afterId: "t", beforeId: "p" });
  expect(between > "a1" && between < "a2").toBe(true);
});

test("a moved column isn't its own neighbour", () => {
  // Moving To do to just before Done: between In progress and Done.
  const position = columnPosition(columns, { excludeId: "t" });
  expect(position > "a2" && position < "a3").toBe(true);
  expect(() => columnPosition(columns, { afterId: "t", excludeId: "t" })).toThrow(/another column/);
});

test("rejects unknown and non-adjacent neighbours", () => {
  expect(() => columnPosition(columns, { afterId: "x" })).toThrow(/after_id must be another column/);
  expect(() => columnPosition(columns, { afterId: "b", beforeId: "p" })).toThrow(/next to each other/);
});
