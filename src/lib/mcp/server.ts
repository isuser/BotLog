import "server-only";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as epicRoute from "@/app/api/v1/epics/[id]/route";
import * as meTasks from "@/app/api/v1/me/tasks/route";
import * as projectEpics from "@/app/api/v1/projects/[id]/epics/route";
import * as projectLabels from "@/app/api/v1/projects/[id]/labels/route";
import * as projectTasks from "@/app/api/v1/projects/[id]/tasks/route";
import * as projects from "@/app/api/v1/projects/route";
import * as taskActivity from "@/app/api/v1/tasks/[id]/activity/route";
import * as taskComments from "@/app/api/v1/tasks/[id]/comments/route";
import * as taskMove from "@/app/api/v1/tasks/[id]/move/route";
import * as taskRoute from "@/app/api/v1/tasks/[id]/route";
import { EPIC_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/api/schemas";
import { callApi, McpApiError } from "./call-api";
import { AGENT_RULES } from "./rules";

/** The default agent rules, sent to every AI client. The user's own prompt can override them. */
export const INSTRUCTIONS = `Botlog is a kanban board you share with humans. You work on tasks through these tools.

Default rules (the user's own instructions to you take precedence):
${AGENT_RULES.map((rule) => `- ${rule}`).join("\n")}

Tasks can be referred to by short ID (like BOT-42) or UUID, and projects by key (like BOT) or UUID.`;

const RECENT_ACTIVITY = 20;
const MAX_COMMENTS = 100;

const taskId = z.string().min(1).describe("Task short ID like BOT-42, or its UUID");
const projectRef = z.string().min(1).describe("Project key like BOT, or its UUID");
const version = z
  .number()
  .int()
  .positive()
  .describe("The task's current version, from your last read. A stale version fails with a 409 conflict.");
const cursor = z.string().optional().describe("next_cursor from the previous page");
const status = z.enum(TASK_STATUSES);
const statuses = z.array(status).min(1).optional().describe("Only tasks in these statuses");
const assignee = z
  .string()
  .regex(/^(me|none|(user|agent):[0-9a-f-]{36})$/i)
  .describe('"me" (you), "none" (unassigned), "user:<uuid>" or "agent:<uuid>"');

const taskFields = {
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(100_000).optional().describe("Markdown"),
  type: z.enum(TASK_TYPES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: assignee.optional(),
  due_date: z.string().nullable().optional().describe("YYYY-MM-DD, or null to clear"),
  epic_id: z.string().nullable().optional().describe("Epic UUID from list_epics, or null to take it out of its epic"),
  labels: z
    .array(z.string().min(1))
    .max(20)
    .optional()
    .describe("Label names or UUIDs from the task's project; replaces the current labels. [] removes all."),
};

const epicFields = {
  title: z.string().min(1).max(500),
  description: z.string().max(100_000).optional().describe("Markdown"),
  status: z.enum(EPIC_STATUSES).optional(),
  target_date: z.string().nullable().optional().describe("YYYY-MM-DD, or null to clear"),
};

type Label = { id: string; name: string };

type Data<T = unknown> = { data: T };

/**
 * An MCP server whose tools act as the agent behind `apiKey`. Built per request: the
 * server holds no state, and every tool call goes through the REST API.
 */
export function createBotlogServer({ apiKey, agentId }: { apiKey: string; agentId: string }) {
  const server = new McpServer({ name: "botlog", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  /** `assignee` as the API wants it: "me" is the calling agent. */
  const toAssignee = (value: string | undefined) => {
    if (value === undefined) return undefined;
    if (value === "none") return null;
    if (value === "me") return { type: "agent" as const, id: agentId };
    const [type, id] = value.split(":") as ["user" | "agent", string];
    return { type, id: id.toLowerCase() };
  };

  /** A project's labels, every page. */
  const projectLabelList = async (project: string) => {
    const labels: Label[] = [];
    let cursor: string | undefined;
    do {
      const page = (await callApi(projectLabels.GET, apiKey, {
        params: { id: project },
        query: { limit: 100, cursor },
      })) as Data<Label[]> & { next_cursor: string | null };
      labels.push(...page.data);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return labels;
  };

  /** Label names or ids to ids. Unknown names fail with the project's label names listed. */
  const toLabelIds = async (project: string, refs: string[] | undefined) => {
    if (refs === undefined) return undefined;
    if (refs.length === 0) return [];
    const labels = await projectLabelList(project);
    return refs.map((ref) => {
      const match = labels.find((l) => l.id === ref.toLowerCase() || l.name.toLowerCase() === ref.trim().toLowerCase());
      if (!match) {
        const known = labels.map((l) => l.name).join(", ") || "none yet";
        throw new McpApiError(400, {
          error: {
            code: "invalid_reference",
            message: `No label "${ref}" in this project (labels: ${known}). Create it with create_label first.`,
          },
        });
      }
      return match.id;
    });
  };

  server.registerTool(
    "list_projects",
    {
      description: "List the projects in the workspace, with task counts per status.",
      inputSchema: z.object({ cursor }),
      annotations: { readOnlyHint: true },
    },
    ({ cursor }) => run(() => callApi(projects.GET, apiKey, { query: { cursor } })),
  );

  server.registerTool(
    "list_my_tasks",
    {
      description:
        "List the tasks assigned to you, across all projects, in board order. Start here to find work.",
      inputSchema: z.object({ status: statuses, cursor }),
      annotations: { readOnlyHint: true },
    },
    ({ status, cursor }) =>
      run(() => callApi(meTasks.GET, apiKey, { query: { status: status?.join(","), cursor } })),
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List a project's tasks in board order, with optional filters.",
      inputSchema: z.object({
        project: projectRef,
        status: statuses,
        type: z.enum(TASK_TYPES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        assignee: assignee.optional(),
        epic_id: z.string().optional().describe('Epic UUID, or "none" for tasks without an epic'),
        label: z.string().min(1).optional().describe("Only tasks with this label (name or UUID)"),
        q: z.string().min(1).max(200).optional().describe("Search: a short ID like BOT-42, or words in the title"),
        cursor,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ project, status, assignee, label, ...filters }) =>
      run(async () =>
        callApi(projectTasks.GET, apiKey, {
          params: { id: project },
          query: {
            ...filters,
            status: status?.join(","),
            assignee: assignee && (assignee === "me" ? `agent:${agentId}` : assignee.toLowerCase()),
            label: label && (await toLabelIds(project, [label]))?.[0],
          },
        }),
      ),
  );

  server.registerTool(
    "get_task",
    {
      description:
        "Get a task with everything needed to work on it: fields, epic, labels, description, comments (oldest first) and recent activity (newest first).",
      inputSchema: z.object({ id: taskId }),
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      run(async () => {
        const params = { id };
        const [task, comments, activity] = (await Promise.all([
          callApi(taskRoute.GET, apiKey, { params }),
          callApi(taskComments.GET, apiKey, { params, query: { limit: MAX_COMMENTS } }),
          callApi(taskActivity.GET, apiKey, { params, query: { limit: RECENT_ACTIVITY } }),
        ])) as [Data<object>, Data<unknown[]> & { next_cursor: string | null }, Data<unknown[]>];
        return {
          data: {
            ...task.data,
            comments: comments.data,
            ...(comments.next_cursor ? { more_comments: true } : {}),
            recent_activity: activity.data,
          },
        };
      }),
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a task at the top of its status column (backlog by default), optionally in an epic and with labels.",
      inputSchema: z.object({
        project: projectRef,
        ...taskFields,
        title: z.string().min(1).max(500),
        status: status.optional(),
      }),
    },
    ({ project, assignee, labels, ...fields }) =>
      run(async () =>
        callApi(projectTasks.POST, apiKey, {
          method: "POST",
          params: { id: project },
          body: { ...fields, assignee: toAssignee(assignee), label_ids: await toLabelIds(project, labels) },
        }),
      ),
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Edit a task's fields, epic or labels. Send only the fields to change, plus the version from your last read. Use move_task to change status.",
      inputSchema: z.object({ id: taskId, version, ...taskFields }),
    },
    ({ id, assignee, labels, ...fields }) =>
      run(async () => {
        let labelIds: string[] | undefined;
        if (labels !== undefined) {
          const task = (await callApi(taskRoute.GET, apiKey, { params: { id } })) as Data<{ project_id: string }>;
          labelIds = await toLabelIds(task.data.project_id, labels);
        }
        return callApi(taskRoute.PATCH, apiKey, {
          method: "PATCH",
          params: { id },
          body: { ...fields, assignee: toAssignee(assignee), label_ids: labelIds },
        });
      }),
  );

  server.registerTool(
    "move_task",
    {
      description:
        "Change a task's status and/or its position in the column. Without after_id or before_id it goes to the top of the column.",
      inputSchema: z.object({
        id: taskId,
        version,
        status: status.optional(),
        after_id: z.string().min(1).optional().describe("Task that should end up directly above it"),
        before_id: z.string().min(1).optional().describe("Task that should end up directly below it"),
      }),
    },
    ({ id, ...body }) =>
      run(() => callApi(taskMove.POST, apiKey, { method: "POST", params: { id }, body })),
  );

  server.registerTool(
    "list_epics",
    {
      description:
        "List a project's epics (groups of tasks) with progress: task counts per status and percent done.",
      inputSchema: z.object({ project: projectRef, status: z.enum(EPIC_STATUSES).optional(), cursor }),
      annotations: { readOnlyHint: true },
    },
    ({ project, ...query }) => run(() => callApi(projectEpics.GET, apiKey, { params: { id: project }, query })),
  );

  server.registerTool(
    "create_epic",
    {
      description: "Create an epic in a project. Add tasks to it with create_task or update_task (epic_id).",
      inputSchema: z.object({ project: projectRef, ...epicFields }),
    },
    ({ project, ...body }) =>
      run(() => callApi(projectEpics.POST, apiKey, { method: "POST", params: { id: project }, body })),
  );

  server.registerTool(
    "update_epic",
    {
      description: "Edit an epic's title, description, status or target date. Send only the fields to change.",
      inputSchema: z.object({ id: z.string().min(1).describe("Epic UUID"), ...epicFields, title: epicFields.title.optional() }),
    },
    ({ id, ...body }) => run(() => callApi(epicRoute.PATCH, apiKey, { method: "PATCH", params: { id }, body })),
  );

  server.registerTool(
    "list_labels",
    {
      description: "List a project's labels.",
      inputSchema: z.object({ project: projectRef }),
      annotations: { readOnlyHint: true },
    },
    ({ project }) => run(async () => ({ data: await projectLabelList(project) })),
  );

  server.registerTool(
    "create_label",
    {
      description: "Create a label in a project. Names are unique in the project, ignoring case.",
      inputSchema: z.object({
        project: projectRef,
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex colour like #84cc16"),
      }),
    },
    ({ project, ...body }) =>
      run(() => callApi(projectLabels.POST, apiKey, { method: "POST", params: { id: project }, body })),
  );

  server.registerTool(
    "add_comment",
    {
      description: "Comment on a task, as you. Markdown is supported.",
      inputSchema: z.object({ id: taskId, body: z.string().min(1).max(20_000) }),
    },
    ({ id, body }) =>
      run(() => callApi(taskComments.POST, apiKey, { method: "POST", params: { id }, body: { body } })),
  );

  return server;
}

/** Runs a tool and answers with the API's JSON, or its `{ error }` body as a tool error. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    if (!(error instanceof McpApiError)) {
      // Don't hand internal messages to the client; log them like the REST API does.
      console.error("Unhandled MCP tool error", error);
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ status: 500, error: { code: "internal", message: "Something went wrong." } }) }],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ status: error.status, ...error.body }) }],
    };
  }
}
