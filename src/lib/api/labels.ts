import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

export const LABEL_SELECT = "id, project_id, name, color, created_at, updated_at";

type LabelRow = { id: string; project_id: string; name: string; color: string; created_at: string; updated_at: string };

export function serializeLabel(row: LabelRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getLabelRow(db: Db, id: string): Promise<LabelRow> {
  if (!isUuid(id)) throw new ApiError("bad_request", `"${id}" is not a label ID. Use the label's UUID.`);
  const { data, error } = await db.from("label").select(LABEL_SELECT).eq("id", id.toLowerCase()).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Label");
  return data;
}

/** Deduplicates `ids` and checks that each is a label of `projectId`. */
export async function resolveLabelIds(db: Db, projectId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (unique.length === 0) return [];
  const { data, error } = await db.from("label").select("id").eq("project_id", projectId).in("id", unique);
  if (error) throw fromPostgrest(error);
  const found = new Set(data.map((row) => row.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) {
    throw new ApiError("invalid_reference", `Label not found in this project: ${missing.join(", ")}.`);
  }
  return unique;
}

/**
 * Makes a task's labels exactly `labelIds`, in one transaction behind the version check
 * (`set_task_labels`). Returns the new version, or null if `version` is stale.
 */
export async function replaceTaskLabels(db: Db, taskId: string, version: number, labelIds: string[]) {
  const { data, error } = await db.rpc("set_task_labels", {
    p_task_id: taskId,
    p_version: version,
    p_label_ids: labelIds,
  });
  if (error) throw fromPostgrest(error);
  return data as number | null;
}
