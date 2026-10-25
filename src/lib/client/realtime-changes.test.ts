import type { Cache } from "swr";
import { describe, expect, test } from "vitest";
import { addChange, keysToRefetch, noChanges } from "./realtime-changes";

const task = (id: string, version: number) => ({ id, short_id: `BOT-${id}`, version });

/** A stand-in for SWR's cache with the given key → data entries. */
function cacheOf(entries: Record<string, unknown>) {
  const map = new Map(Object.entries(entries).map(([key, data]) => [key, { data }]));
  return { keys: () => map.keys(), get: (key: string) => map.get(key) } as unknown as Cache;
}

const board = cacheOf({
  "/projects/BOT/tasks": [task("1", 3), task("2", 5)],
  "/tasks/BOT-1": task("1", 3),
  "/projects/BOT": { id: "p", key: "BOT" },
});

function decide(cache: Cache, events: [table: "activity_log" | "task", row: Record<string, unknown>][]) {
  const pending = noChanges();
  for (const [table, row] of events) addChange(pending, table, row);
  return keysToRefetch(cache, pending);
}

describe("keysToRefetch", () => {
  test("a task update the cache already has (this tab's own) refetches nothing", () => {
    expect(decide(board, [["task", { id: "1", version: 3 }]])).toBe("none");
  });

  test("an own edit still refreshes activity and the like, not the tasks", () => {
    const events: Parameters<typeof decide>[1] = [
      ["task", { id: "1", version: 3 }],
      ["activity_log", { entity_type: "task", entity_id: "1", action: "updated" }],
    ];
    expect(decide(board, events)).toBe("others");
  });

  test("a newer version than the cache (someone else's change) refetches everything", () => {
    expect(decide(board, [["task", { id: "2", version: 6 }]])).toBe("all");
  });

  test("a task the cache doesn't have refetches everything", () => {
    expect(decide(board, [["task", { id: "9", version: 1 }]])).toBe("all");
  });

  test("any older cached copy refetches everything", () => {
    const mixed = cacheOf({ "/projects/BOT/tasks": [task("1", 2)], "/tasks/BOT-1": task("1", 3) });
    expect(decide(mixed, [["task", { id: "1", version: 3 }]])).toBe("all");
  });

  test("a created task refetches everything unless the cache already has it", () => {
    expect(decide(board, [["activity_log", { entity_type: "task", entity_id: "2", action: "created" }]])).toBe("none");
    expect(decide(board, [["activity_log", { entity_type: "task", entity_id: "9", action: "created" }]])).toBe("all");
  });

  test("comments refresh the other keys only", () => {
    expect(decide(board, [["activity_log", { entity_type: "task", entity_id: "1", action: "commented" }]])).toBe(
      "others",
    );
  });

  test("label, epic, column and project changes refetch everything", () => {
    for (const entity_type of ["label", "epic", "board_column", "project"]) {
      expect(decide(board, [["activity_log", { entity_type, entity_id: "x", action: "updated" }]])).toBe("all");
    }
  });

  test("one foreign change in a burst refetches everything", () => {
    const events: Parameters<typeof decide>[1] = [
      ["task", { id: "1", version: 3 }],
      ["task", { id: "2", version: 6 }],
    ];
    expect(decide(board, events)).toBe("all");
  });

  test("an event without the row's fields refetches everything", () => {
    expect(decide(board, [["task", {}]])).toBe("all");
  });
});
