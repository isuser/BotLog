import type { z } from "zod";
import type { Actor, Db } from "./auth";
import { fromPostgrest } from "./errors";
import { decodeCursor, keysetFilter, page, parseLimit } from "./pagination";
import type { taskListFilters } from "./schemas";
import { serializeTask, TASK_SELECT, type TaskRow } from "./tasks";

const ORDER = ["status", "position", "id"] as const;

/**
 * Lists tasks in board order (status, then position), with filters and cursor pagination.
 * Archived tasks are left out unless `archived=true`, which lists only archived ones.
 */
export async function listTasks(
  db: Db,
  actor: Actor,
  url: URL,
  filters: z.output<typeof taskListFilters>,
  scope: { projectId?: string; assignedTo?: Actor },
) {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, ORDER.length);

  let query = db.from("task").select(TASK_SELECT);
  if (scope.projectId) query = query.eq("project_id", scope.projectId);
  if (scope.assignedTo) query = assignedTo(query, scope.assignedTo);

  query = filters.archived === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.status) query = query.in("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.epic_id) {
    query = filters.epic_id === "none" ? query.is("epic_id", null) : query.eq("epic_id", filters.epic_id);
  }
  if (filters.assignee === "me") query = assignedTo(query, actor);
  else if (filters.assignee === "none") query = query.is("assignee_user_id", null).is("assignee_agent_id", null);
  else if (filters.assignee?.startsWith("user:")) query = query.eq("assignee_user_id", filters.assignee.slice(5));
  else if (filters.assignee?.startsWith("agent:")) query = query.eq("assignee_agent_id", filters.assignee.slice(6));

  if (cursor) query = query.or(keysetFilter([...ORDER], cursor));
  for (const column of ORDER) query = query.order(column);

  const { data, error } = await query.limit(limit + 1);
  if (error) throw fromPostgrest(error);
  const result = page(data as unknown as TaskRow[], limit, (row) => [row.status, row.position, row.id]);
  return { data: result.data.map(serializeTask), next_cursor: result.next_cursor };
}

function assignedTo<Q extends { eq: (column: string, value: string) => Q }>(query: Q, actor: Actor): Q {
  return actor.type === "agent"
    ? query.eq("assignee_agent_id", actor.agentId)
    : query.eq("assignee_user_id", actor.userId);
}
