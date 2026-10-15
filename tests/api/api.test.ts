/**
 * End-to-end tests of the REST API against the Supabase project in .env.local.
 * Run with `pnpm test:api`. Each run creates throwaway users and deletes them afterwards.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as unknownRoute from "@/app/api/[...path]/route";
import * as agentKey from "@/app/api/v1/agents/[id]/api-keys/[keyId]/route";
import * as agentKeys from "@/app/api/v1/agents/[id]/api-keys/route";
import * as agentRestore from "@/app/api/v1/agents/[id]/restore/route";
import * as agentRoute from "@/app/api/v1/agents/[id]/route";
import * as agents from "@/app/api/v1/agents/route";
import * as epicRestore from "@/app/api/v1/epics/[id]/restore/route";
import * as epicRoute from "@/app/api/v1/epics/[id]/route";
import * as labelRoute from "@/app/api/v1/labels/[id]/route";
import * as me from "@/app/api/v1/me/route";
import * as meTasks from "@/app/api/v1/me/tasks/route";
import * as projectEpics from "@/app/api/v1/projects/[id]/epics/route";
import * as projectLabels from "@/app/api/v1/projects/[id]/labels/route";
import * as projectExport from "@/app/api/v1/projects/[id]/export/route";
import * as projectRoute from "@/app/api/v1/projects/[id]/route";
import * as projectTasks from "@/app/api/v1/projects/[id]/tasks/route";
import * as projects from "@/app/api/v1/projects/route";
import * as taskActivity from "@/app/api/v1/tasks/[id]/activity/route";
import * as taskComments from "@/app/api/v1/tasks/[id]/comments/route";
import * as taskMove from "@/app/api/v1/tasks/[id]/move/route";
import * as taskRestore from "@/app/api/v1/tasks/[id]/restore/route";
import * as taskRoute from "@/app/api/v1/tasks/[id]/route";
import * as tasksRoute from "@/app/api/v1/tasks/route";
import { generateApiKey } from "@/lib/api/api-keys";
import { call, createTestUser, deleteTestUsers, signingKeyIsLive, type TestUser } from "./harness";

const keyLive = await signingKeyIsLive();

let alice: TestUser;
let bob: TestUser;
let outsider: TestUser;
const PROJECT = "API";

type Task = { id: string; short_id: string; version: number; status: string; title: string };

const createTask = async (fields: Record<string, unknown>, token = alice.token, project = PROJECT) => {
  const res = await call(projectTasks.POST, { method: "POST", params: { id: project }, token, body: fields });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as Task;
};

const listTitles = async (query: string, token = alice.token) => {
  const res = await call(projectTasks.GET, { path: `/api/v1/projects/${PROJECT}/tasks?${query}`, params: { id: PROJECT }, token });
  expect(res.status).toBe(200);
  return (res.body.data as Task[]).map((t) => t.title);
};

beforeAll(async () => {
  await deleteTestUsers(); // leftovers from an interrupted run
  [alice, bob, outsider] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  vi.stubEnv("ALLOWED_EMAILS", `${alice.email},${bob.email}`);

  const res = await call(projects.POST, { method: "POST", token: alice.token, body: { name: "API tests", key: "api" } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteTestUsers([alice, bob, outsider].filter(Boolean).map((u) => u.id));
});

describe("auth", () => {
  test("requests without credentials get 401 in the standard shape", async () => {
    const res = await call(projects.GET, {});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
  });

  test("users not on the allowlist get 403", async () => {
    const res = await call(projects.GET, { token: outsider.token });
    expect(res.status).toBe(403);
  });

  test("garbage tokens and unknown API keys get 401", async () => {
    expect((await call(projects.GET, { token: "not-a-jwt" })).status).toBe(401);
    expect((await call(projects.GET, { token: generateApiKey().key })).status).toBe(401);
  });

  test("unknown endpoints answer with a JSON 404", async () => {
    const res = await call(unknownRoute.GET, { path: "/api/v1/nope" });
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("projects", () => {
  test("keys are uppercased, unique and validated", async () => {
    const dup = await call(projects.POST, { method: "POST", token: alice.token, body: { name: "Again", key: "API" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("already_exists");

    const bad = await call(projects.POST, { method: "POST", token: alice.token, body: { name: "x", key: "1-bad" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe("key");
  });

  test("can be read by key or UUID, with task counts", async () => {
    const byKey = await call(projectRoute.GET, { params: { id: "api" }, token: alice.token });
    expect(byKey.status).toBe(200);
    expect(byKey.body.data).toMatchObject({ key: "API", task_counts: expect.objectContaining({ total: expect.any(Number) }) });

    const byId = await call(projectRoute.GET, { params: { id: byKey.body.data.id }, token: alice.token });
    expect(byId.body.data.key).toBe("API");
  });

  test("names can change, keys can't", async () => {
    const renamed = await call(projectRoute.PATCH, { method: "PATCH", params: { id: PROJECT }, token: alice.token, body: { name: "API suite" } });
    expect(renamed.body.data.name).toBe("API suite");

    const rekey = await call(projectRoute.PATCH, { method: "PATCH", params: { id: PROJECT }, token: alice.token, body: { key: "NEW" } });
    expect(rekey.status).toBe(400);
  });

  test("the Done window defaults to 14 days and takes 1 to 365", async () => {
    const read = await call(projectRoute.GET, { params: { id: PROJECT }, token: alice.token });
    expect(read.body.data.done_window_days).toBe(14);

    const set = (days: unknown) =>
      call(projectRoute.PATCH, { method: "PATCH", params: { id: PROJECT }, token: alice.token, body: { done_window_days: days } });
    expect((await set(30)).body.data.done_window_days).toBe(30);
    expect((await set(0)).status).toBe(400);
    expect((await set(366)).status).toBe(400);
    expect((await set(1.5)).status).toBe(400);
    expect((await set(14)).status).toBe(200);
  });

  test("other workspaces can't see them", async () => {
    vi.stubEnv("ALLOWED_EMAILS", `${alice.email},${bob.email}`);
    const res = await call(projectRoute.GET, { params: { id: PROJECT }, token: bob.token });
    expect(res.status).toBe(404);
    const list = await call(projects.GET, { token: bob.token });
    expect(list.body.data).toEqual([]);
  });
});

describe("tasks", () => {
  test("get sequential short IDs and defaults", async () => {
    const a = await createTask({ title: "First" });
    const b = await createTask({ title: "Second", type: "bug", priority: "high" });
    const [, aNum] = a.short_id.split("-").map(Number);
    expect(b.short_id).toBe(`API-${aNum + 1}`);
    expect(a).toMatchObject({ status: "backlog", version: 1, type: "feature", priority: "none", assignee: null });
  });

  test("can be read by short ID in any case, or UUID", async () => {
    const task = await createTask({ title: "Lookup" });
    const byShort = await call(taskRoute.GET, { params: { id: task.short_id.toLowerCase() }, token: alice.token });
    expect(byShort.body.data.id).toBe(task.id);
    const byId = await call(taskRoute.GET, { params: { id: task.id }, token: alice.token });
    expect(byId.body.data.short_id).toBe(task.short_id);

    expect((await call(taskRoute.GET, { params: { id: "API-99999" }, token: alice.token })).status).toBe(404);
    expect((await call(taskRoute.GET, { params: { id: "nonsense" }, token: alice.token })).status).toBe(400);
  });

  test("updates need the current version; stale ones get 409", async () => {
    const task = await createTask({ title: "Versioned" });
    const ok = await call(taskRoute.PATCH, {
      method: "PATCH", params: { id: task.short_id }, token: alice.token,
      body: { title: "Versioned v2", version: 1, assignee: { type: "user", id: alice.id } },
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ title: "Versioned v2", version: 2, assignee: { type: "user", id: alice.id } });

    const stale = await call(taskRoute.PATCH, {
      method: "PATCH", params: { id: task.short_id }, token: alice.token, body: { title: "Lost", version: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("conflict");
    expect(stale.body.error.message).toMatch(/re-read/i);
  });

  test("can't be assigned to someone outside the workspace", async () => {
    const task = await createTask({ title: "Assign" });
    const res = await call(taskRoute.PATCH, {
      method: "PATCH", params: { id: task.id }, token: alice.token,
      body: { assignee: { type: "user", id: bob.id }, version: task.version },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reference");
  });

  test("new tasks go to the top of their column, and moves keep order", async () => {
    const c = await createTask({ title: "col C", status: "todo" });
    const b = await createTask({ title: "col B", status: "todo" });
    const a = await createTask({ title: "col A", status: "todo" });
    expect(await listTitles("status=todo")).toEqual(["col A", "col B", "col C"]);

    // Put A between B and C.
    const moved = await call(taskMove.POST, {
      method: "POST", params: { id: a.short_id }, token: alice.token,
      body: { after_id: b.short_id, before_id: c.short_id, version: a.version },
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await listTitles("status=todo")).toEqual(["col B", "col A", "col C"]);

    // Move C to the top of in_progress.
    const toProgress = await call(taskMove.POST, {
      method: "POST", params: { id: c.id }, token: alice.token, body: { status: "in_progress", version: c.version },
    });
    expect(toProgress.body.data.status).toBe("in_progress");
    expect(await listTitles("status=todo")).toEqual(["col B", "col A"]);
  });

  test("done_at is set by moving to Done and cleared by moving out", async () => {
    const task = await createTask({ title: "Finish me" });
    expect(task).toMatchObject({ done_at: null });
    const done = await call(taskMove.POST, {
      method: "POST", params: { id: task.id }, token: alice.token, body: { status: "done", version: task.version },
    });
    expect(done.body.data.done_at).toEqual(expect.any(String));
    const reopened = await call(taskMove.POST, {
      method: "POST", params: { id: task.id }, token: alice.token, body: { status: "todo", version: done.body.data.version },
    });
    expect(reopened.body.data.done_at).toBeNull();
  });

  test("archived tasks leave the board, stay readable and can be restored", async () => {
    const task = await createTask({ title: "Archive me" });
    const archived = await call(taskRoute.DELETE, { method: "DELETE", params: { id: task.short_id }, token: alice.token });
    expect(archived.body.data.archived_at).not.toBeNull();

    expect(await listTitles("status=backlog")).not.toContain("Archive me");
    expect(await listTitles("archived=true")).toContain("Archive me");

    const edit = await call(taskRoute.PATCH, {
      method: "PATCH", params: { id: task.id }, token: alice.token, body: { title: "x", version: archived.body.data.version },
    });
    expect(edit.body.error.code).toBe("archived");

    const restored = await call(taskRestore.POST, { method: "POST", params: { id: task.id }, token: alice.token });
    expect(restored.body.data.archived_at).toBeNull();
    expect(await listTitles("status=backlog")).toContain("Archive me");
  });

  test("lists paginate with cursors", async () => {
    for (const n of [1, 2, 3]) await createTask({ title: `page ${n}`, status: "done" });
    const titles: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `status=done&limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await call(projectTasks.GET, { path: `/api/v1/projects/${PROJECT}/tasks?${query}`, params: { id: PROJECT }, token: alice.token });
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      titles.push(...res.body.data.map((t: Task) => t.title));
      cursor = res.body.next_cursor;
    } while (cursor);
    expect(titles).toEqual(["page 3", "page 2", "page 1"]);
  });

  test("filters validate their input", async () => {
    const res = await call(projectTasks.GET, { path: `/api/v1/projects/${PROJECT}/tasks?status=nope`, params: { id: PROJECT }, token: alice.token });
    expect(res.status).toBe(400);
  });
});

describe("comments, activity and my tasks", () => {
  test("comments are authored by the caller", async () => {
    const task = await createTask({ title: "Discuss" });
    const posted = await call(taskComments.POST, { method: "POST", params: { id: task.short_id }, token: alice.token, body: { body: "Looks good" } });
    expect(posted.status).toBe(201);
    expect(posted.body.data.author).toMatchObject({ type: "user", id: alice.id });

    const list = await call(taskComments.GET, { params: { id: task.short_id }, token: alice.token });
    expect(list.body.data.map((c: { body: string }) => c.body)).toEqual(["Looks good"]);
  });

  test("activity lists changes newest first", async () => {
    const task = await createTask({ title: "Tracked" });
    await call(taskMove.POST, { method: "POST", params: { id: task.id }, token: alice.token, body: { status: "todo", version: 1 } });
    const res = await call(taskActivity.GET, { params: { id: task.id }, token: alice.token });
    expect(res.body.data.map((e: { action: string }) => e.action)).toEqual(["moved", "created"]);
    expect(res.body.data[0].actor).toMatchObject({ type: "human", user_id: alice.id });
  });

  test("my tasks are the ones assigned to me", async () => {
    await createTask({ title: "Mine", assignee: { type: "user", id: alice.id } });
    const res = await call(meTasks.GET, { token: alice.token });
    const titles = res.body.data.map((t: Task) => t.title);
    expect(titles).toContain("Mine");
    expect(titles).not.toContain("First");
  });
});

describe("epics and labels", () => {
  const post = (handler: typeof projectEpics.POST, body: unknown, token = alice.token) =>
    call(handler, { method: "POST", params: { id: PROJECT }, token, body });

  test("epics show progress from their active tasks", async () => {
    const created = await post(projectEpics.POST, { title: "Launch", target_date: "2026-12-01" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const epic = created.body.data;
    expect(epic).toMatchObject({ title: "Launch", status: "planned", project_key: PROJECT, progress: { total: 0, percent_done: 0 } });

    await createTask({ title: "Epic task 1", epic_id: epic.id, status: "done" });
    const second = await createTask({ title: "Epic task 2", epic_id: epic.id });
    await createTask({ title: "Epic task 3", epic_id: epic.id, status: "done" });
    await call(taskRoute.DELETE, { method: "DELETE", params: { id: second.id }, token: alice.token });

    const read = await call(epicRoute.GET, { params: { id: epic.id }, token: alice.token });
    expect(read.body.data.progress).toEqual({ backlog: 0, todo: 0, in_progress: 0, done: 2, total: 2, percent_done: 100 });

    const list = await call(projectEpics.GET, { params: { id: PROJECT }, token: alice.token });
    expect(list.body.data.map((e: { id: string }) => e.id)).toContain(epic.id);
    const inEpic = await listTitles(`epic_id=${epic.id}`);
    expect(inEpic.sort()).toEqual(["Epic task 1", "Epic task 3"]);
  });

  test("epics can be edited, archived and restored; archived ones take no new tasks", async () => {
    const epic = (await post(projectEpics.POST, { title: "Old epic" })).body.data;
    const edited = await call(epicRoute.PATCH, { method: "PATCH", params: { id: epic.id }, token: alice.token, body: { status: "in_progress" } });
    expect(edited.body.data.status).toBe("in_progress");

    const archived = await call(epicRoute.DELETE, { method: "DELETE", params: { id: epic.id }, token: alice.token });
    expect(archived.body.data.archived_at).not.toBeNull();
    const active = await call(projectEpics.GET, { params: { id: PROJECT }, token: alice.token });
    expect(active.body.data.map((e: { id: string }) => e.id)).not.toContain(epic.id);

    const blocked = await call(projectTasks.POST, { method: "POST", params: { id: PROJECT }, token: alice.token, body: { title: "x", epic_id: epic.id } });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe("archived");
    expect((await call(epicRoute.PATCH, { method: "PATCH", params: { id: epic.id }, token: alice.token, body: { title: "y" } })).status).toBe(400);

    const restored = await call(epicRestore.POST, { method: "POST", params: { id: epic.id }, token: alice.token });
    expect(restored.body.data.archived_at).toBeNull();
  });

  test("labels are per project, unique by name ignoring case", async () => {
    const bug = await post(projectLabels.POST, { name: "Backend", color: "#84cc16" });
    expect(bug.status, JSON.stringify(bug.body)).toBe(201);
    const dupe = await post(projectLabels.POST, { name: "backend" });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.message).toMatch(/label with this name/);
    expect((await post(projectLabels.POST, { name: "x", color: "red" })).status).toBe(400);

    const renamed = await call(labelRoute.PATCH, { method: "PATCH", params: { id: bug.body.data.id }, token: alice.token, body: { name: "API" } });
    expect(renamed.body.data).toMatchObject({ name: "API", color: "#84cc16" });
    const list = await call(projectLabels.GET, { params: { id: PROJECT }, token: alice.token });
    expect(list.body.data.map((l: { name: string }) => l.name)).toContain("API");
  });

  test("tasks take labels on create and edit, and a labels-only edit is version-checked", async () => {
    const ui = (await post(projectLabels.POST, { name: "UI" })).body.data;
    const docs = (await post(projectLabels.POST, { name: "Docs" })).body.data;

    const task = await createTask({ title: "Labelled", label_ids: [ui.id, ui.id] });
    expect(task).toMatchObject({ labels: [{ id: ui.id, name: "UI" }] });

    const edited = await call(taskRoute.PATCH, { method: "PATCH", params: { id: task.id }, token: alice.token, body: { label_ids: [docs.id, ui.id], version: task.version } });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data.labels.map((l: { name: string }) => l.name)).toEqual(["Docs", "UI"]);
    expect(edited.body.data.version).toBe(task.version + 1);

    const stale = await call(taskRoute.PATCH, { method: "PATCH", params: { id: task.id }, token: alice.token, body: { label_ids: [], version: task.version } });
    expect(stale.status).toBe(409);

    expect(await listTitles(`label=${docs.id}`)).toEqual(["Labelled"]);

    const activity = await call(taskActivity.GET, { params: { id: task.id }, token: alice.token });
    expect(activity.body.data.filter((a: { action: string }) => a.action === "label_added")).toHaveLength(2);

    // Deleting a label takes it off its tasks.
    await call(labelRoute.DELETE, { method: "DELETE", params: { id: docs.id }, token: alice.token });
    const after = await call(taskRoute.GET, { params: { id: task.id }, token: alice.token });
    expect(after.body.data.labels.map((l: { name: string }) => l.name)).toEqual(["UI"]);
  });

  test("labels and epics from another project or workspace are rejected", async () => {
    const other = await call(projects.POST, { method: "POST", token: bob.token, body: { name: "Bob's", key: "BOB" } });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    const bobLabel = await call(projectLabels.POST, { method: "POST", params: { id: "BOB" }, token: bob.token, body: { name: "Mine" } });
    const bobEpic = await call(projectEpics.POST, { method: "POST", params: { id: "BOB" }, token: bob.token, body: { title: "Mine" } });

    const withLabel = await call(projectTasks.POST, { method: "POST", params: { id: PROJECT }, token: alice.token, body: { title: "x", label_ids: [bobLabel.body.data.id] } });
    expect(withLabel.status).toBe(400);
    expect(withLabel.body.error.code).toBe("invalid_reference");
    const withEpic = await call(projectTasks.POST, { method: "POST", params: { id: PROJECT }, token: alice.token, body: { title: "x", epic_id: bobEpic.body.data.id } });
    expect(withEpic.status).toBe(400);

    expect((await call(epicRoute.GET, { params: { id: bobEpic.body.data.id }, token: alice.token })).status).toBe(404);
    expect((await call(labelRoute.PATCH, { method: "PATCH", params: { id: bobLabel.body.data.id }, token: alice.token, body: { name: "z" } })).status).toBe(404);
  });
});

describe("search", () => {
  test("q finds tasks by short ID, bare number or title words, in a project and across projects", async () => {
    const found = await createTask({ title: "Searchable 100%_literal thing" });
    await createTask({ title: "Searchable decoy 100 percent" });

    expect(await listTitles(`q=${encodeURIComponent(found.short_id.toLowerCase())}`)).toEqual([found.title]);
    expect(await listTitles(`q=${found.short_id.split("-")[1]}`)).toEqual([found.title]);
    expect(await listTitles(`q=${encodeURIComponent("100%_lit")}`)).toEqual([found.title]);
    expect((await listTitles("q=searchable")).sort()).toEqual(["Searchable 100%_literal thing", "Searchable decoy 100 percent"]);

    const across = await call(tasksRoute.GET, { path: `/api/v1/tasks?q=${found.short_id}`, token: alice.token });
    expect(across.status, JSON.stringify(across.body)).toBe(200);
    expect(across.body.data.map((t: Task) => t.id)).toEqual([found.id]);
  });

  test("workspace-wide search only sees your own workspace", async () => {
    const res = await call(tasksRoute.GET, { path: "/api/v1/tasks?q=searchable", token: bob.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("export", () => {
  test("downloads the whole project as JSON, archived items and comments included", async () => {
    const label = (await call(projectLabels.POST, { method: "POST", params: { id: PROJECT }, token: alice.token, body: { name: "Exported" } })).body.data;
    const task = await createTask({ title: "To export", label_ids: [label.id] });
    await call(taskComments.POST, { method: "POST", params: { id: task.id }, token: alice.token, body: { body: "Exported comment" } });
    const archived = await createTask({ title: "Archived but exported" });
    await call(taskRoute.DELETE, { method: "DELETE", params: { id: archived.id }, token: alice.token });

    const res = await call(projectExport.GET, { params: { id: PROJECT }, token: alice.token });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="botlog-api-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.body).toMatchObject({ format: "botlog-project-export", version: 1, project: { key: PROJECT } });
    const exported = res.body.tasks.find((t: { id: string }) => t.id === task.id);
    expect(exported).toMatchObject({ short_id: task.short_id, label_ids: [label.id] });
    expect(res.body.tasks.some((t: { id: string; archived_at: string | null }) => t.id === archived.id && t.archived_at)).toBe(true);
    expect(res.body.labels.some((l: { id: string }) => l.id === label.id)).toBe(true);
    expect(res.body.comments.some((c: { task_id: string; body: string }) => c.task_id === task.id && c.body === "Exported comment")).toBe(true);
    expect(res.body.comments[0]).not.toHaveProperty("task");
  });

  test("another workspace can't export it", async () => {
    expect((await call(projectExport.GET, { params: { id: PROJECT }, token: bob.token })).status).toBe(404);
  });
});

describe("rate limits", () => {
  test("over the limit answers 429 with Retry-After, counted per caller", async () => {
    const [carol, dave] = await Promise.all([createTestUser(), createTestUser()]);
    vi.stubEnv("ALLOWED_EMAILS", `${alice.email},${bob.email},${carol.email},${dave.email}`);
    vi.stubEnv("RATE_LIMIT_USER_PER_MINUTE", "3");
    try {
      const statuses: number[] = [];
      let limited: Awaited<ReturnType<typeof call>> | undefined;
      for (let i = 0; i < 5; i++) {
        const res = await call(projects.GET, { token: carol.token });
        statuses.push(res.status);
        if (res.status === 429) limited ??= res;
      }
      // A minute boundary can land mid-loop and reset the count, so only require that the limit bit.
      expect(statuses.slice(0, 3)).not.toContain(429);
      expect(limited, `statuses: ${statuses}`).toBeDefined();
      expect(limited!.body.error).toMatchObject({ code: "rate_limited", details: { limit: 3 } });
      const retryAfter = Number(limited!.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);

      // Someone else's allowance is separate.
      expect((await call(projects.GET, { token: dave.token })).status).toBe(200);
    } finally {
      vi.stubEnv("RATE_LIMIT_USER_PER_MINUTE", "");
      vi.stubEnv("ALLOWED_EMAILS", `${alice.email},${bob.email}`);
      await deleteTestUsers([carol.id, dave.id]);
    }
  });
});

describe("profile", () => {
  test("reads and updates your own name and theme", async () => {
    const res = await call(me.GET, { token: bob.token });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ id: bob.id, email: bob.email, theme: "lime" });

    const updated = await call(me.PATCH, { method: "PATCH", token: bob.token, body: { name: "  Bob  ", theme: "sandpaper" } });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.data).toMatchObject({ id: bob.id, name: "Bob", theme: "sandpaper" });
    expect((await call(me.GET, { token: bob.token })).body.data.theme).toBe("sandpaper");
  });

  test("rejects unknown themes, extra fields and empty bodies", async () => {
    for (const body of [{ theme: "neon" }, { email: "x@example.com" }, {}]) {
      const res = await call(me.PATCH, { method: "PATCH", token: bob.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  test("needs a signed-in person", async () => {
    expect((await call(me.GET, {})).status).toBe(401);
  });
});

describe.skipIf(!keyLive)("agents with API keys", () => {
  let agentId: string;
  let apiKey: string;

  beforeAll(async () => {
    const { data: agent, error } = await alice.db.from("agent").insert({ name: "Test bot" }).select("id").single();
    if (error) throw error;
    agentId = agent.id;
    const { key, prefix, hash } = generateApiKey();
    const { error: keyError } = await alice.db.from("api_key").insert({ agent_id: agentId, name: "tests", prefix, hash } as never);
    if (keyError) throw keyError;
    apiKey = key;
  });

  test("work the core loop: find a task, move it, comment, finish", async () => {
    const task = await createTask({ title: "For the bot", assignee: { type: "agent", id: agentId } });

    const mine = await call(meTasks.GET, { token: apiKey });
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.data.map((t: Task) => t.id)).toEqual([task.id]);

    const started = await call(taskMove.POST, { method: "POST", params: { id: task.short_id }, token: apiKey, body: { status: "in_progress", version: task.version } });
    expect(started.status, JSON.stringify(started.body)).toBe(200);

    const comment = await call(taskComments.POST, { method: "POST", params: { id: task.short_id }, token: apiKey, body: { body: "Done: wrote it." } });
    expect(comment.body.data.author).toMatchObject({ type: "agent", id: agentId, name: "Test bot" });

    const done = await call(taskMove.POST, { method: "POST", params: { id: task.short_id }, token: apiKey, body: { status: "done", version: started.body.data.version } });
    expect(done.body.data.status).toBe("done");

    const activity = await call(taskActivity.GET, { params: { id: task.id }, token: alice.token });
    const [latest] = activity.body.data;
    expect(latest).toMatchObject({ action: "moved", actor: { type: "ai", agent_id: agentId, user_id: alice.id, name: "Test bot" } });
    expect(latest.actor.api_key_id).toEqual(expect.any(String));
  });

  test("can't read or change their owner's profile", async () => {
    expect((await call(me.GET, { token: apiKey })).status).toBe(403);
    expect((await call(me.PATCH, { method: "PATCH", token: apiKey, body: { theme: "sandpaper" } })).status).toBe(403);
  });

  test("see only their owner's workspace", async () => {
    const res = await call(projects.GET, { token: apiKey });
    expect(res.body.data.map((p: { key: string }) => p.key)).toEqual([PROJECT]);
  });

  test("revoked keys stop working", async () => {
    const { key, prefix, hash } = generateApiKey();
    const { data } = await alice.db.from("api_key").insert({ agent_id: agentId, name: "temp", prefix, hash } as never).select("id").single();
    expect((await call(projects.GET, { token: key })).status).toBe(200);
    await alice.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("id", data!.id);
    expect((await call(projects.GET, { token: key })).status).toBe(401);
  });
});

describe("agent management", () => {
  let agentId: string;

  const createKey = async (name = "laptop", token = alice.token, id = agentId) =>
    call(agentKeys.POST, { method: "POST", params: { id }, token, body: { name } });

  beforeAll(async () => {
    const res = await call(agents.POST, { method: "POST", token: alice.token, body: { name: "  Managed bot ", description: "Writes tests" } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Managed bot", description: "Writes tests", owner_user_id: alice.id, archived_at: null });
    agentId = res.body.data.id;
  });

  test("are listed and readable in the workspace only", async () => {
    const list = await call(agents.GET, { token: alice.token });
    expect(list.body.data.map((a: { id: string }) => a.id)).toContain(agentId);
    expect((await call(agentRoute.GET, { params: { id: agentId }, token: alice.token })).status).toBe(200);

    expect((await call(agentRoute.GET, { params: { id: agentId }, token: bob.token })).status).toBe(404);
    expect((await call(agentRoute.GET, { params: { id: "not-a-uuid" }, token: alice.token })).status).toBe(404);
    const bobs = await call(agents.GET, { token: bob.token });
    expect(bobs.body.data.map((a: { id: string }) => a.id)).not.toContain(agentId);
  });

  test("validate their fields", async () => {
    expect((await call(agents.POST, { method: "POST", token: alice.token, body: { name: " " } })).status).toBe(400);
    expect((await call(agents.POST, { method: "POST", token: alice.token, body: { name: "x", owner_user_id: bob.id } })).status).toBe(400);
    const edit = await call(agentRoute.PATCH, { method: "PATCH", params: { id: agentId }, token: alice.token, body: { description: "Writes more tests" } });
    expect(edit.body.data.description).toBe("Writes more tests");
    expect((await call(agentRoute.PATCH, { method: "PATCH", params: { id: agentId }, token: alice.token, body: {} })).status).toBe(400);
  });

  test("can't be managed from another workspace", async () => {
    expect((await createKey("x", bob.token)).status).toBe(404);
    expect((await call(agentRoute.DELETE, { method: "DELETE", params: { id: agentId }, token: bob.token })).status).toBe(404);
    expect((await call(agentKeys.GET, { params: { id: agentId }, token: bob.token })).status).toBe(404);
  });

  test("keys are shown once, listed without the secret, and track use", async () => {
    const created = await createKey();
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { key, prefix, id } = created.body.data;
    expect(key).toMatch(/^bl_/);
    expect(key.startsWith(prefix)).toBe(true);

    const list = await call(agentKeys.GET, { params: { id: agentId }, token: alice.token });
    const listed = list.body.data.find((k: { id: string }) => k.id === id);
    expect(listed).toMatchObject({ name: "laptop", prefix, last_used_at: null, revoked_at: null });
    expect(listed).not.toHaveProperty("key");
    expect(listed).not.toHaveProperty("hash");
    expect(JSON.stringify(list.body)).not.toContain(key);

    if (!keyLive) return;
    expect((await call(projects.GET, { token: key })).status).toBe(200);
    const after = await call(agentKeys.GET, { params: { id: agentId }, token: alice.token });
    expect(after.body.data.find((k: { id: string }) => k.id === id).last_used_at).toEqual(expect.any(String));
  });

  test("revoked keys stop working and stay listed", async () => {
    const { key, id } = (await createKey("temp")).body.data;
    const revoked = await call(agentKey.DELETE, { method: "DELETE", params: { id: agentId, keyId: id }, token: alice.token });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.revoked_at).toEqual(expect.any(String));
    const again = await call(agentKey.DELETE, { method: "DELETE", params: { id: agentId, keyId: id }, token: alice.token });
    expect(again.body.data.revoked_at).toBe(revoked.body.data.revoked_at);

    expect((await call(projects.GET, { token: key })).status).toBe(401);
    const active = await call(agentKeys.GET, { path: `/api/v1/agents/${agentId}/api-keys?revoked=false`, params: { id: agentId }, token: alice.token });
    expect(active.body.data.map((k: { id: string }) => k.id)).not.toContain(id);
    const all = await call(agentKeys.GET, { params: { id: agentId }, token: alice.token });
    expect(all.body.data.map((k: { id: string }) => k.id)).toContain(id);
  });

  test("archived agents leave the list, their keys stop working, and they can be restored", async () => {
    const { key } = (await createKey("archive me")).body.data;

    const archived = await call(agentRoute.DELETE, { method: "DELETE", params: { id: agentId }, token: alice.token });
    expect(archived.body.data.archived_at).toEqual(expect.any(String));
    expect((await call(agents.GET, { token: alice.token })).body.data.map((a: { id: string }) => a.id)).not.toContain(agentId);
    const archivedList = await call(agents.GET, { path: "/api/v1/agents?archived=true", token: alice.token });
    expect(archivedList.body.data.map((a: { id: string }) => a.id)).toContain(agentId);

    expect((await call(projects.GET, { token: key })).status).toBe(401);
    expect((await createKey("nope")).status).toBe(400);
    expect((await call(agentRoute.PATCH, { method: "PATCH", params: { id: agentId }, token: alice.token, body: { name: "x" } })).status).toBe(400);

    const restored = await call(agentRestore.POST, { method: "POST", params: { id: agentId }, token: alice.token });
    expect(restored.body.data.archived_at).toBeNull();
    if (keyLive) expect((await call(projects.GET, { token: key })).status).toBe(200);
  });

  test.skipIf(!keyLive)("agents can list agents but not manage agents or keys", async () => {
    const { key, id } = (await createKey("agent self")).body.data;
    expect((await call(agents.GET, { token: key })).status).toBe(200);
    expect((await call(agentRoute.GET, { params: { id: agentId }, token: key })).status).toBe(200);

    const forbidden = [
      await call(agents.POST, { method: "POST", token: key, body: { name: "Rogue" } }),
      await call(agentRoute.PATCH, { method: "PATCH", params: { id: agentId }, token: key, body: { name: "Rogue" } }),
      await call(agentRoute.DELETE, { method: "DELETE", params: { id: agentId }, token: key }),
      await call(agentRestore.POST, { method: "POST", params: { id: agentId }, token: key }),
      await call(agentKeys.GET, { params: { id: agentId }, token: key }),
      await createKey("more", key),
      await call(agentKey.DELETE, { method: "DELETE", params: { id: agentId, keyId: id }, token: key }),
    ];
    expect(forbidden.map((res) => res.status)).toEqual(forbidden.map(() => 403));
  });
});
