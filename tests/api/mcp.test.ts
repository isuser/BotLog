/**
 * End-to-end tests of the MCP server: a real MCP client talks to the /api/mcp route handler,
 * whose tools call the REST API against the Supabase project in .env.local.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as agentKeys from "@/app/api/v1/agents/[id]/api-keys/route";
import * as agents from "@/app/api/v1/agents/route";
import * as mcpRoute from "@/app/api/mcp/route";
import * as projectTasks from "@/app/api/v1/projects/[id]/tasks/route";
import * as projects from "@/app/api/v1/projects/route";
import * as taskComments from "@/app/api/v1/tasks/[id]/comments/route";
import * as taskRoute from "@/app/api/v1/tasks/[id]/route";
import { AGENT_TOOLS } from "@/lib/mcp/rules";
import { call, createTestUser, deleteTestUsers, signingKeyIsLive, type TestUser } from "./harness";

const keyLive = await signingKeyIsLive();
const MCP_URL = "http://localhost/api/mcp";
const PROJECT = "MCP";

/** fetch for the MCP client that calls the route handler in-process. */
const routeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const request = new NextRequest(new Request(input, init));
  const handler = { GET: mcpRoute.GET, POST: mcpRoute.POST, DELETE: mcpRoute.DELETE }[request.method];
  return handler ? handler(request) : new Response(null, { status: 405 });
};

const rawPost = (headers: Record<string, string>) =>
  routeFetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

async function connect(apiKey: string) {
  const client = new Client({ name: "botlog-tests", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: routeFetch,
    requestInit: { headers: { authorization: `Bearer ${apiKey}` } },
  });
  await client.connect(transport);
  return client;
}

type Task = { id: string; short_id: string; version: number; status: string; title: string; assignee: { type: string; id: string } | null };

let alice: TestUser;
let agentId: string;
let apiKey: string;
let client: Client;

/** Calls a tool and parses its JSON text; `isError` results come back as `{ error }`. */
async function tool<T = { data: unknown }>(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  return { isError: Boolean(result.isError), ...(JSON.parse(text) as T) };
}

beforeAll(async () => {
  alice = await createTestUser();
  vi.stubEnv("ALLOWED_EMAILS", alice.email);

  const project = await call(projects.POST, { method: "POST", token: alice.token, body: { name: "MCP tests", key: PROJECT } });
  expect(project.status, JSON.stringify(project.body)).toBe(201);
  const agent = await call(agents.POST, { method: "POST", token: alice.token, body: { name: "MCP bot" } });
  agentId = agent.body.data.id;
  const key = await call(agentKeys.POST, { method: "POST", params: { id: agentId }, token: alice.token, body: { name: "tests" } });
  apiKey = key.body.data.key;
  if (keyLive) client = await connect(apiKey);
});

afterAll(async () => {
  await client?.close();
  vi.unstubAllEnvs();
  await deleteTestUsers([alice].filter(Boolean).map((u) => u.id));
});

describe("auth", () => {
  test("requests without an API key get 401 with a Bearer challenge", async () => {
    const res = await rawPost({});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  test("user access tokens aren't accepted: MCP is for agents", async () => {
    const res = await rawPost({ authorization: `Bearer ${alice.token}` });
    expect(res.status).toBe(401);
  });

  test("unknown keys get 401", async () => {
    const res = await rawPost({ authorization: "Bearer bl_not-a-real-key" });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!keyLive)("tools", () => {
  test("are listed, and the default agent rules are sent as instructions", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_comment",
      "create_epic",
      "create_label",
      "create_task",
      "edit_comment",
      "get_task",
      "list_columns",
      "list_epics",
      "list_labels",
      "list_my_tasks",
      "list_projects",
      "list_tasks",
      "move_task",
      "update_epic",
      "update_task",
    ]);
    // The Help page lists the same tools.
    expect(tools.map((t) => t.name).sort()).toEqual(AGENT_TOOLS.map((t) => t.name).sort());
    expect(client.getInstructions()).toContain("list_my_tasks");
    expect(client.getInstructions()).toContain("409");
  });

  test("list_projects shows the owner's workspace", async () => {
    const res = await tool<{ data: { key: string }[] }>("list_projects");
    expect(res.data.map((p) => p.key)).toEqual([PROJECT]);
  });

  test("work the core loop: find a task, start it, comment, finish", async () => {
    const created = await call(projectTasks.POST, {
      method: "POST",
      params: { id: PROJECT },
      token: alice.token,
      body: { title: "Write the docs", status: "todo", assignee: { type: "agent", id: agentId } },
    });
    const task = created.body.data as Task;

    const mine = await tool<{ data: Task[] }>("list_my_tasks", { status: ["todo"] });
    expect(mine.data.map((t) => t.short_id)).toEqual([task.short_id]);

    const read = await tool<{ data: Task & { comments: unknown[]; recent_activity: { action: string }[] } }>("get_task", {
      id: task.short_id.toLowerCase(),
    });
    expect(read.data).toMatchObject({ id: task.id, comments: [], title: "Write the docs" });
    expect(read.data.recent_activity.map((a) => a.action)).toContain("created");

    const started = await tool<{ data: Task }>("move_task", { id: task.short_id, version: read.data.version, status: "in_progress" });
    expect(started.data.status).toBe("in_progress");

    const comment = await tool<{ data: { author: { type: string; id: string } } }>("add_comment", { id: task.short_id, body: "Done: wrote the docs." });
    expect(comment.data.author).toMatchObject({ type: "agent", id: agentId });

    const done = await tool<{ data: Task }>("move_task", { id: task.short_id, version: started.data.version, status: "done" });
    expect(done.data.status).toBe("done");

    const after = await tool<{ data: { comments: { body: string }[]; recent_activity: { action: string; actor: { type: string } }[] } }>("get_task", { id: task.id });
    expect(after.data.comments.map((c) => c.body)).toEqual(["Done: wrote the docs."]);
    expect(after.data.recent_activity[0]).toMatchObject({ action: "moved", actor: { type: "ai" } });
  });

  test("edit_comment fixes the agent's own comments only", async () => {
    const task = (await tool<{ data: Task }>("create_task", { project: PROJECT, title: "Edit a comment" })).data;
    const own = (await tool<{ data: { id: string } }>("add_comment", { id: task.short_id, body: "Dnoe" })).data;
    const edited = await tool<{ data: { body: string; edited_at: string | null; can_edit: boolean; can_delete: boolean } }>("edit_comment", { comment_id: own.id, body: "Done" });
    expect(edited.data).toMatchObject({ body: "Done", can_edit: true, can_delete: false });
    expect(edited.data.edited_at).not.toBeNull();

    const human = await call(taskComments.POST, { method: "POST", params: { id: task.id }, token: alice.token, body: { body: "Thanks" } });
    const denied = await tool<{ status: number }>("edit_comment", { comment_id: human.body.data.id, body: "Rewritten" });
    expect(denied).toMatchObject({ isError: true, status: 403 });
  });

  test("stale versions come back as a 409 conflict tool error", async () => {
    const task = (await tool<{ data: Task }>("create_task", { project: PROJECT, title: "Contended" })).data;
    await call(taskRoute.PATCH, { method: "PATCH", params: { id: task.id }, token: alice.token, body: { title: "Changed by a human", version: task.version } });

    const stale = await tool<{ status: number; error: { code: string } }>("update_task", { id: task.short_id, version: task.version, title: "Mine" });
    expect(stale).toMatchObject({ isError: true, status: 409, error: { code: "conflict" } });
    const move = await tool<{ status: number }>("move_task", { id: task.short_id, version: task.version, status: "done" });
    expect(move).toMatchObject({ isError: true, status: 409 });

    const fresh = await tool<{ data: Task }>("get_task", { id: task.short_id });
    const retried = await tool<{ data: Task }>("update_task", { id: task.short_id, version: fresh.data.version, title: "Mine" });
    expect(retried.data.title).toBe("Mine");
  });

  test("create_task and update_task take \"me\" and \"none\" as assignees", async () => {
    const created = await tool<{ data: Task }>("create_task", {
      project: PROJECT.toLowerCase(),
      title: "Self-assigned",
      priority: "high",
      assignee: "me",
    });
    expect(created.isError).toBe(false);
    expect(created.data.assignee).toMatchObject({ type: "agent", id: agentId });

    const listed = await tool<{ data: Task[] }>("list_tasks", { project: PROJECT, assignee: "me", status: ["backlog"] });
    expect(listed.data.map((t) => t.id)).toContain(created.data.id);

    const unassigned = await tool<{ data: Task }>("update_task", { id: created.data.short_id, version: created.data.version, assignee: "none" });
    expect(unassigned.data.assignee).toBeNull();
  });

  test("bad input and missing tasks come back as tool errors in the API's shape", async () => {
    expect(await tool("get_task", { id: `${PROJECT}-99999` })).toMatchObject({ isError: true, status: 404, error: { code: "not_found" } });
    expect(await tool("get_task", { id: "nonsense" })).toMatchObject({ isError: true, status: 400 });
    expect(await tool("list_tasks", { project: "NOPE" })).toMatchObject({ isError: true, status: 404 });
    const task = (await tool<{ data: Task }>("create_task", { project: PROJECT, title: "No-op" })).data;
    expect(await tool("update_task", { id: task.id, version: task.version })).toMatchObject({ isError: true, status: 400 });
  });

  test("epics and labels: create them, file a task, and see it all in get_task", async () => {
    const epic = await tool<{ data: { id: string; progress: { total: number } } }>("create_epic", { project: PROJECT, title: "Agent epic" });
    expect(epic.isError, JSON.stringify(epic)).toBe(false);
    await tool("create_label", { project: PROJECT, name: "Backend" });

    const created = await tool<{ data: Task & { labels: { name: string }[]; epic: { id: string } } }>("create_task", {
      project: PROJECT,
      title: "Filed by the agent",
      epic_id: epic.data.id,
      labels: ["backend"],
    });
    expect(created.isError, JSON.stringify(created)).toBe(false);
    expect(created.data.labels.map((l) => l.name)).toEqual(["Backend"]);
    expect(created.data.epic.id).toBe(epic.data.id);

    const unknown = await tool<{ error: { message: string } }>("update_task", { id: created.data.short_id, version: created.data.version, labels: ["Frontend"] });
    expect(unknown.isError).toBe(true);
    expect(unknown.error.message).toMatch(/No label "Frontend".*Backend.*create_label/);

    const filtered = await tool<{ data: Task[] }>("list_tasks", { project: PROJECT, label: "Backend" });
    expect(filtered.data.map((t) => t.title)).toEqual(["Filed by the agent"]);

    const epics = await tool<{ data: { id: string; progress: { total: number } }[] }>("list_epics", { project: PROJECT });
    expect(epics.data.find((e) => e.id === epic.data.id)?.progress.total).toBe(1);

    const updated = await tool<{ data: { status: string } }>("update_epic", { id: epic.data.id, status: "in_progress" });
    expect(updated.data.status).toBe("in_progress");

    const full = await tool<{ data: { epic: { title: string }; labels: { name: string }[]; recent_activity: { action: string }[] } }>("get_task", { id: created.data.short_id });
    expect(full.data.epic.title).toBe("Agent epic");
    expect(full.data.recent_activity.map((a) => a.action)).toContain("label_added");
  });

  test("a revoked key can't connect", async () => {
    const key = await call(agentKeys.POST, { method: "POST", params: { id: agentId }, token: alice.token, body: { name: "temp" } });
    const { key: temp, id } = key.body.data;
    const { DELETE } = await import("@/app/api/v1/agents/[id]/api-keys/[keyId]/route");
    await call(DELETE, { method: "DELETE", params: { id: agentId, keyId: id }, token: alice.token });
    expect((await rawPost({ authorization: `Bearer ${temp}` })).status).toBe(401);
  });
});
