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
import * as me from "@/app/api/v1/me/route";
import * as meTasks from "@/app/api/v1/me/tasks/route";
import * as projectRoute from "@/app/api/v1/projects/[id]/route";
import * as projectTasks from "@/app/api/v1/projects/[id]/tasks/route";
import * as projects from "@/app/api/v1/projects/route";
import * as taskActivity from "@/app/api/v1/tasks/[id]/activity/route";
import * as taskComments from "@/app/api/v1/tasks/[id]/comments/route";
import * as taskMove from "@/app/api/v1/tasks/[id]/move/route";
import * as taskRestore from "@/app/api/v1/tasks/[id]/restore/route";
import * as taskRoute from "@/app/api/v1/tasks/[id]/route";
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
