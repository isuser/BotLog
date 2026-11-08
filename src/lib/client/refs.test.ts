import { describe, expect, test } from "vitest";
import {
  clashingKeys,
  isFullSegment,
  isTaskSegment,
  normalizeSegment,
  projectHref,
  projectLabel,
  projectSegment,
  segmentLabel,
  taskLabel,
  taskProjectSegment,
  taskSegment,
} from "./refs";

describe("clashingKeys", () => {
  test("keys the viewer sees on more than one project", () => {
    expect(clashingKeys([{ key: "BOT" }, { key: "WEB" }, { key: "BOT" }, { key: "OPS" }])).toEqual(new Set(["BOT"]));
  });
  test("none when every key is unique, or with no projects", () => {
    expect(clashingKeys([{ key: "BOT" }, { key: "WEB" }]).size).toBe(0);
    expect(clashingKeys([]).size).toBe(0);
  });
});

describe("labels", () => {
  const project = { key: "BOT", full_key: "ana/BOT" };
  const task = { short_id: "BOT-42", full_id: "ana/BOT-42" };
  test("bare unless the key clashes", () => {
    expect(projectLabel(project, false)).toBe("BOT");
    expect(projectLabel(project, true)).toBe("ana/BOT");
    expect(taskLabel(task, false)).toBe("BOT-42");
    expect(taskLabel(task, true)).toBe("ana/BOT-42");
  });
});

describe("project links", () => {
  const project = { key: "BOT", full_key: "ana/BOT" };
  test("bare unless the viewer sees another project with the key", () => {
    expect(projectSegment(project, false)).toBe("BOT");
    expect(projectSegment(project, true)).toBe("ana%2FBOT");
    expect(projectHref(project, [{ key: "BOT" }, { key: "WEB" }])).toBe("/projects/BOT");
    expect(projectHref(project, [{ key: "BOT" }, { key: "BOT" }])).toBe("/projects/ana%2FBOT");
  });
});

describe("URL segments", () => {
  test("normalize keys to uppercase and handles to lowercase, encoded or not", () => {
    expect(normalizeSegment("bot")).toBe("BOT");
    expect(normalizeSegment("bot-42")).toBe("BOT-42");
    expect(normalizeSegment("ANA%2fbot")).toBe("ana%2FBOT");
    expect(normalizeSegment("Ana/Bot-42")).toBe("ana%2FBOT-42");
    expect(normalizeSegment("my-team%2FWEB")).toBe("my-team%2FWEB");
  });
  test("survive a stray % that isn't an escape", () => {
    expect(normalizeSegment("BOT%")).toBe("BOT%25");
  });
  test("read as labels", () => {
    expect(segmentLabel("ana%2Fbot")).toBe("ana/BOT");
    expect(segmentLabel("bot")).toBe("BOT");
    expect(isFullSegment("ana%2FBOT")).toBe(true);
    expect(isFullSegment("ana/BOT")).toBe(true);
    expect(isFullSegment("BOT")).toBe(false);
  });
  test("for a task and its project", () => {
    const task = { project_key: "BOT", short_id: "BOT-42", full_id: "my-team/BOT-42" };
    expect(taskProjectSegment(task, false)).toBe("BOT");
    expect(taskProjectSegment(task, true)).toBe("my-team%2FBOT");
    expect(taskSegment(task, false)).toBe("BOT-42");
    expect(taskSegment(task, true)).toBe("my-team%2FBOT-42");
  });
  test("match a task by short ID, full ID or UUID, in any case", () => {
    const task = { id: "8c0f1c3e-0000-4000-8000-000000000000", short_id: "BOT-42", full_id: "ana/BOT-42" };
    expect(isTaskSegment("bot-42", task)).toBe(true);
    expect(isTaskSegment("ANA%2Fbot-42", task)).toBe(true);
    expect(isTaskSegment(task.id, task)).toBe(true);
    expect(isTaskSegment("BOT-43", task)).toBe(false);
    expect(isTaskSegment("pedro%2FBOT-42", task)).toBe(false);
    expect(isTaskSegment(undefined, task)).toBe(false);
  });
});
