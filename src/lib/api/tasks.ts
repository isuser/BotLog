import { generateKeyBetween } from "fractional-indexing";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { parseTaskRef, shortId } from "./ids";

type TaskStatus = Database["public"]["Enums"]["task_status"];

export const TASK_SELECT = `
  id, project_id, number, epic_id, title, description, type, status, position, priority,
  assignee_user_id, assignee_agent_id, due_date, version, archived_at, created_at, updated_at,
  project:project!inner(key),
  assignee_user:profile!task_assignee_user_id_fkey(id, name, email),
  assignee_agent:agent!task_assignee_agent_id_fkey(id, name, avatar)
`;

export type TaskRow = Database["public"]["Tables"]["task"]["Row"] & {
  project: { key: string };
  assignee_user: { id: string; name: string; email: string } | null;
  assignee_agent: { id: string; name: string; avatar: string | null } | null;
};

export function serializeTask(row: TaskRow) {
  return {
    id: row.id,
    short_id: shortId(row.project.key, row.number),
    project_id: row.project_id,
    project_key: row.project.key,
    number: row.number,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    position: row.position,
    priority: row.priority,
    epic_id: row.epic_id,
    assignee: row.assignee_user
      ? { type: "user" as const, ...row.assignee_user }
      : row.assignee_agent
        ? { type: "agent" as const, ...row.assignee_agent }
        : null,
    due_date: row.due_date,
    version: row.version,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** A task the caller can see, by UUID or short ID (archived ones included). */
export async function getTaskRow(db: Db, ref: string): Promise<TaskRow> {
  const parsed = parseTaskRef(ref);
  const query = db.from("task").select(TASK_SELECT);
  const { data, error } = await ("id" in parsed
    ? query.eq("id", parsed.id)
    : query.eq("project.key", parsed.key).eq("number", parsed.number)
  ).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Task");
  return data as unknown as TaskRow;
}

export function assertNotArchived(task: TaskRow) {
  if (task.archived_at) {
    throw new ApiError("archived", "This task is archived. Restore it before changing it.");
  }
}

/** Maps the API's `assignee` to the two assignee columns. */
export function assigneeColumns(assignee: { type: "user" | "agent"; id: string } | null) {
  return {
    assignee_user_id: assignee?.type === "user" ? assignee.id : null,
    assignee_agent_id: assignee?.type === "agent" ? assignee.id : null,
  };
}

/**
 * The fractional position for a task placed in `status` between the task directly above
 * (`afterRef`) and the one directly below (`beforeRef`). Without either, it goes to the
 * top of the column. `excludeId` is the task being moved, so it isn't its own neighbor.
 */
export async function positionFor(
  db: Db,
  projectId: string,
  status: TaskStatus,
  { afterRef, beforeRef, excludeId }: { afterRef?: string; beforeRef?: string; excludeId?: string } = {},
): Promise<string> {
  const neighbor = async (ref: string, label: string) => {
    const task = await getTaskRow(db, ref);
    if (task.project_id !== projectId || task.status !== status || task.archived_at || task.id === excludeId) {
      throw new ApiError("bad_request", `${label} must be another active task in the target column.`);
    }
    return task.position;
  };

  const adjacent = async (from: string | null, direction: "above" | "below") => {
    let query = db
      .from("task")
      .select("position")
      .eq("project_id", projectId)
      .eq("status", status)
      .is("archived_at", null);
    if (excludeId) query = query.neq("id", excludeId);
    if (from !== null) query = direction === "below" ? query.gt("position", from) : query.lt("position", from);
    const { data, error } = await query
      .order("position", { ascending: direction === "below" })
      .limit(1)
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    return data?.position ?? null;
  };

  let above: string | null;
  let below: string | null;
  if (afterRef && beforeRef) {
    above = await neighbor(afterRef, "after_id");
    below = await neighbor(beforeRef, "before_id");
  } else if (afterRef) {
    above = await neighbor(afterRef, "after_id");
    below = await adjacent(above, "below");
  } else if (beforeRef) {
    below = await neighbor(beforeRef, "before_id");
    above = await adjacent(below, "above");
  } else {
    above = null;
    below = await adjacent(null, "below");
  }

  if (above !== null && below !== null && above >= below) {
    // Out of order (or tied after concurrent inserts): place right after `above`.
    if (afterRef && beforeRef) throw new ApiError("bad_request", "after_id must be above before_id.");
    return generateKeyBetween(above, null);
  }
  return generateKeyBetween(above, below);
}
