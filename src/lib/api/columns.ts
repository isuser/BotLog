import { generateKeyBetween } from "fractional-indexing";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

type TaskStatus = Database["public"]["Enums"]["task_status"];

/** Column fields plus how many active tasks it holds. */
export const COLUMN_SELECT =
  "id, project_id, kind, name, counts_as, position, hidden, created_at, updated_at, tasks:task!task_column_fkey(count)";

type ColumnRow = Database["public"]["Tables"]["board_column"]["Row"] & { tasks: { count: number }[] };

/** Narrows the task count embed to active tasks. */
export const activeTaskCount = <Q extends { is: (c: string, v: null) => Q }>(query: Q): Q =>
  query.is("tasks.archived_at", null);

export function serializeColumn(row: ColumnRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    /** backlog, todo, in_progress or done for the built-ins; custom for the rest. */
    kind: row.kind,
    name: row.name,
    /** The status of the tasks in this column. */
    counts_as: row.counts_as,
    position: row.position,
    hidden: row.hidden,
    task_count: row.tasks?.[0]?.count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export type Column = ReturnType<typeof serializeColumn>;

export async function getColumnRow(db: Db, id: string): Promise<Column> {
  if (!isUuid(id)) throw new ApiError("bad_request", `"${id}" is not a column ID. Use the column's UUID.`);
  const { data, error } = await activeTaskCount(db.from("board_column").select(COLUMN_SELECT))
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Column");
  return serializeColumn(data as unknown as ColumnRow);
}

/** Every column of a project, in board order. Projects have a handful, so no paging here. */
export async function projectColumns(db: Db, projectId: string): Promise<Column[]> {
  const { data, error } = await activeTaskCount(db.from("board_column").select(COLUMN_SELECT))
    .eq("project_id", projectId)
    .order("position")
    .order("id");
  if (error) throw fromPostgrest(error);
  return (data as unknown as ColumnRow[]).map(serializeColumn);
}

/**
 * The column a task goes to when only a status is given: that status's built-in column, or
 * the first visible column counting as it when the built-in is hidden (column_for_status).
 */
export async function columnForStatus(db: Db, projectId: string, status: TaskStatus): Promise<string> {
  const { data, error } = await db.rpc("column_for_status", { p_project_id: projectId, p_status: status });
  if (error) throw fromPostgrest(error);
  if (!data) throw new ApiError("internal", "This project has no column for that status.");
  return data;
}

/** A column a task can be put in: one of the task's project, and not hidden (unless it's already there). */
export async function assertColumnUsable(db: Db, projectId: string, columnId: string, currentColumnId?: string) {
  const column = await getColumnRow(db, columnId).catch((error) => {
    if (error instanceof ApiError && error.code === "not_found") {
      throw new ApiError("invalid_reference", "Column not found in this project.");
    }
    throw error;
  });
  if (column.project_id !== projectId) throw new ApiError("invalid_reference", "Column not found in this project.");
  if (column.hidden && column.id !== currentColumnId) {
    throw new ApiError("bad_request", `The ${column.name} column is hidden. Show it in the project's settings first.`);
  }
  return column;
}

/**
 * Where a column goes among the project's columns: right below `afterId` or right above
 * `beforeId`, or by default just before Done. The database keeps every column between
 * Backlog and Done, and refuses anything else.
 */
export function columnPosition(
  columns: Column[],
  { afterId, beforeId, excludeId }: { afterId?: string; beforeId?: string; excludeId?: string },
): string {
  const others = columns.filter((c) => c.id !== excludeId);
  const indexOf = (id: string, label: string) => {
    const index = others.findIndex((c) => c.id === id.toLowerCase());
    if (index === -1) throw new ApiError("bad_request", `${label} must be another column of this project.`);
    return index;
  };

  let above: string | null;
  let below: string | null;
  if (afterId && beforeId) {
    const a = indexOf(afterId, "after_id");
    const b = indexOf(beforeId, "before_id");
    if (b !== a + 1) throw new ApiError("bad_request", "after_id and before_id must be next to each other.");
    [above, below] = [others[a].position, others[b].position];
  } else if (afterId) {
    const a = indexOf(afterId, "after_id");
    [above, below] = [others[a].position, others[a + 1]?.position ?? null];
  } else {
    const b = beforeId ? indexOf(beforeId, "before_id") : others.findIndex((c) => c.kind === "done");
    [above, below] = [others[b - 1]?.position ?? null, others[b].position];
  }
  return generateKeyBetween(above, below);
}
