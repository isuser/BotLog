import { assertEpicUsable } from "@/lib/api/epics";
import { fromPostgrest, versionConflict } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { replaceTaskLabels, resolveLabelIds } from "@/lib/api/labels";
import { updateTaskSchema } from "@/lib/api/schemas";
import { assertNotArchived, assigneeColumns, getTaskRow, serializeTask, TASK_SELECT, type TaskRow } from "@/lib/api/tasks";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: serializeTask(await getTaskRow(db, params.id)) });
});

/**
 * Edits fields, including the epic and the labels (`label_ids` replaces the current set).
 * `version` must match the task's current version, or the answer is 409.
 */
export const PATCH = route<Params>(async ({ db, request, params }) => {
  const { version, assignee, label_ids, ...fields } = await parseBody(request, updateTaskSchema);
  const task = await getTaskRow(db, params.id);
  assertNotArchived(task);
  if (task.version !== version) throw versionConflict();
  if (fields.epic_id && fields.epic_id !== task.epic_id) await assertEpicUsable(db, task.project_id, fields.epic_id);
  const labelIds = label_ids && (await resolveLabelIds(db, task.project_id, label_ids));

  const changes = { ...fields, ...(assignee === undefined ? {} : assigneeColumns(assignee)) };
  let current = version;
  if (Object.keys(changes).length > 0) {
    const { data, error } = await db
      .from("task")
      .update(changes)
      .eq("id", task.id)
      .eq("version", current)
      .select("version")
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    if (!data) throw versionConflict();
    current = data.version;
  }
  // Labels change in one transaction behind the same version check.
  if (labelIds && (await replaceTaskLabels(db, task.id, current, labelIds)) === null) throw versionConflict();

  return json({ data: serializeTask(await getTaskRow(db, task.id)) });
});

/** Archives the task. It stays readable by ID and can be restored. */
export const DELETE = route<Params>(async ({ db, params }) => {
  const task = await getTaskRow(db, params.id);
  if (task.archived_at) return json({ data: serializeTask(task) });

  const { data, error } = await db
    .from("task")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeTask(data as unknown as TaskRow) });
});
