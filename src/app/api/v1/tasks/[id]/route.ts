import { fromPostgrest, versionConflict } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { updateTaskSchema } from "@/lib/api/schemas";
import { assertNotArchived, assigneeColumns, getTaskRow, serializeTask, TASK_SELECT, type TaskRow } from "@/lib/api/tasks";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: serializeTask(await getTaskRow(db, params.id)) });
});

/** Edits fields. `version` must match the task's current version, or the answer is 409. */
export const PATCH = route<Params>(async ({ db, request, params }) => {
  const { version, assignee, ...fields } = await parseBody(request, updateTaskSchema);
  const task = await getTaskRow(db, params.id);
  assertNotArchived(task);
  if (task.version !== version) throw versionConflict();

  const { data, error } = await db
    .from("task")
    .update({ ...fields, ...(assignee === undefined ? {} : assigneeColumns(assignee)) })
    .eq("id", task.id)
    .eq("version", version)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw versionConflict();
  return json({ data: serializeTask(data as unknown as TaskRow) });
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
