import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";
import { withTaskCounts } from "./projects";
import { TASK_STATUSES } from "./schemas";

/** Epic columns, the project key, and a count of active tasks per status (for progress). */
export const EPIC_SELECT =
  "id, project_id, title, description, status, target_date, archived_at, created_at, updated_at, project:project!inner(key), backlog:task(count), todo:task(count), in_progress:task(count), done:task(count)";

type EpicRow = Pick<
  Database["public"]["Tables"]["epic"]["Row"],
  "id" | "project_id" | "title" | "description" | "status" | "target_date" | "archived_at" | "created_at" | "updated_at"
> & { project: { key: string } } & Record<(typeof TASK_STATUSES)[number], { count: number }[]>;

export function serializeEpic(row: EpicRow) {
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, row[s]?.[0]?.count ?? 0])) as Record<
    (typeof TASK_STATUSES)[number],
    number
  >;
  const total = TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return {
    id: row.id,
    project_id: row.project_id,
    project_key: row.project.key,
    title: row.title,
    description: row.description,
    status: row.status,
    target_date: row.target_date,
    /** Active tasks per status; `percent_done` is done / total, 0 for an empty epic. */
    progress: { ...counts, total, percent_done: total ? Math.round((counts.done / total) * 100) : 0 },
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Selects epics with their task counts narrowed to active tasks. */
export const selectEpics = (db: Db) => withTaskCounts(db.from("epic").select(EPIC_SELECT));

/** An epic the caller can see, by UUID (archived ones included). */
export async function getEpicRow(db: Db, id: string): Promise<EpicRow> {
  if (!isUuid(id)) throw new ApiError("bad_request", `"${id}" is not an epic ID. Use the epic's UUID.`);
  const { data, error } = await selectEpics(db).eq("id", id.toLowerCase()).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Epic");
  return data as unknown as EpicRow;
}

export function assertEpicNotArchived(epic: { archived_at: string | null }) {
  if (epic.archived_at) throw new ApiError("archived", "This epic is archived. Restore it before changing it.");
}

/** Checks that a task in `projectId` can be put in `epicId`: same project, not archived. */
export async function assertEpicUsable(db: Db, projectId: string, epicId: string) {
  const { data, error } = await db.from("epic").select("project_id, archived_at").eq("id", epicId).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data || data.project_id !== projectId) {
    throw new ApiError("invalid_reference", "Epic not found in this project.");
  }
  if (data.archived_at) throw new ApiError("archived", "This epic is archived. Restore it to add tasks to it.");
}
