import { describe, expect, test } from "vitest";
import { describeActivity, nameLookup, type NameLookup } from "./activity";
import type { Activity, Task } from "./types";

const entry = (action: string, changes: Record<string, unknown> = {}): Activity => ({
  id: "a1",
  entity_type: "task",
  entity_id: "t1",
  action,
  actor: { type: "human", user_id: "u1", agent_id: null, api_key_id: null, name: "Ana" },
  changes: changes as Activity["changes"],
  created_at: "2026-10-13T10:00:00Z",
});

const known = new Map([
  ["agent:g1", "Claude"],
  ["user:u1", "you"],
  ["label:l1", "UI"],
  ["epic:e1", "Launch"],
]);
const names: NameLookup = (type, id) => known.get(`${type}:${id}`);
const change = (from: unknown, to: unknown) => ({ from, to });

describe("describeActivity", () => {
  test("describes lifecycle actions", () => {
    expect(describeActivity(entry("created", { title: "x" }), names)).toBe("created the task");
    expect(describeActivity(entry("archived"), names)).toBe("archived the task");
    expect(describeActivity(entry("restored"), names)).toBe("restored the task");
  });

  test("describes a move by its columns and ignores the position", () => {
    const moved = entry("moved", { status: change("todo", "in_progress"), position: change("a", "b") });
    expect(describeActivity(moved, names)).toBe("moved it from To do to In progress");
  });

  test("describes a move by column names when it knows them", () => {
    const columns: NameLookup = (type, id) => (type === "column" ? { c1: "In progress", c2: "In review" }[id] : undefined);
    expect(describeActivity(entry("moved", { column_id: change("c1", "c2") }), columns)).toBe(
      "moved it from In progress to In review",
    );
    // A deleted column has no name any more.
    expect(describeActivity(entry("moved", { column_id: change("gone", "c2") }), columns)).toBe("moved it to In review");
  });

  test("describes a move between columns with the same status", () => {
    const moved = entry("moved", { column_id: change("c1", "c2"), position: change("a", "b") });
    expect(describeActivity(moved, names)).toBe("moved it to another column");
    const withStatus = entry("moved", { status: change("todo", "done"), column_id: change("c1", "c2") });
    expect(describeActivity(withStatus, names)).toBe("moved it from To do to Done");
  });

  test("lists every changed field in one sentence", () => {
    const updated = entry("updated", {
      title: change("Old", "New"),
      priority: change("none", "high"),
      type: change("feature", "bug"),
    });
    expect(describeActivity(updated, names)).toBe(
      "renamed the task to “New”, set priority to High and changed the type to Bug",
    );
  });

  test("describes clearing fields", () => {
    expect(describeActivity(entry("updated", { priority: change("low", "none") }), names)).toBe("removed the priority");
    expect(describeActivity(entry("updated", { due_date: change("2026-10-20", null) }), names)).toBe(
      "removed the due date",
    );
    expect(describeActivity(entry("updated", { description: change("x", "") }), names)).toBe("cleared the description");
  });

  test("formats due dates without shifting the day", () => {
    expect(describeActivity(entry("updated", { due_date: change(null, "2026-10-20") }), names)).toBe(
      "set the due date to Oct 20, 2026",
    );
  });

  test("describes a reassignment once, by the new assignee", () => {
    const toAgent = entry("updated", { assignee_user_id: change("u1", null), assignee_agent_id: change(null, "g1") });
    expect(describeActivity(toAgent, names)).toBe("assigned it to Claude");
    expect(describeActivity(entry("updated", { assignee_user_id: change(null, "u1") }), names)).toBe(
      "assigned it to you",
    );
    expect(describeActivity(entry("updated", { assignee_agent_id: change("g1", null) }), names)).toBe("unassigned it");
  });

  test("falls back when the assignee's name isn't known", () => {
    expect(describeActivity(entry("updated", { assignee_agent_id: change(null, "gone") }), names)).toBe(
      "assigned it to an agent",
    );
    expect(describeActivity(entry("updated", { assignee_user_id: change(null, "other") }), names)).toBe(
      "assigned it to someone",
    );
  });

  test("names labels and epics when it knows them", () => {
    expect(describeActivity(entry("label_added", { label_id: "l1" }), names)).toBe("added the label “UI”");
    expect(describeActivity(entry("label_removed", { label_id: "gone" }), names)).toBe("removed a label");
    expect(describeActivity(entry("updated", { epic_id: change(null, "e1") }), names)).toBe("moved it to the epic “Launch”");
    expect(describeActivity(entry("updated", { epic_id: change("e1", null) }), names)).toBe("took it out of its epic");
  });

  test("leaves out comments and changes to fields it doesn't show", () => {
    expect(describeActivity(entry("commented", { comment_id: "c1" }), names)).toBeNull();
    expect(describeActivity(entry("updated", { something_new: change(1, 2) }), names)).toBeNull();
  });
});

describe("nameLookup", () => {
  test("knows the viewer, agents and the current assignee", () => {
    const task = { assignee: { type: "user", id: "u2", name: "Bea", email: "bea@example.com" } } as Task;
    const lookup = nameLookup({ id: "u1" }, [{ id: "g1", name: "Claude" }], task);
    expect(lookup("user", "u1")).toBe("you");
    expect(lookup("agent", "g1")).toBe("Claude");
    expect(lookup("user", "u2")).toBe("Bea");
    expect(lookup("agent", "u1")).toBeUndefined();
  });
});
