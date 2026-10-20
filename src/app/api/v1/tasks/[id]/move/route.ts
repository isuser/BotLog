import { assertColumnUsable, columnForStatus } from "@/lib/api/columns";
import { fromPostgrest, versionConflict } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { moveTaskSchema } from "@/lib/api/schemas";
import { assertNotArchived, getTaskRow, positionFor, serializeTask, TASK_SELECT, type TaskRow } from "@/lib/api/tasks";

type Params = { id: string };

/**
 * Moves a task to another column and/or position. `column_id` picks the column; `status`
 * picks that status's column, and keeps the task where it is if it already has that status
 * (so "in_progress" leaves a task in a custom In review column alone).
 */
export const POST = route<Params>(async ({ db, request, params }) => {
  const { column_id, status, after_id, before_id, version } = await parseBody(request, moveTaskSchema);
  const task = await getTaskRow(db, params.id);
  assertNotArchived(task);
  if (task.version !== version) throw versionConflict();

  let columnId = task.column_id;
  if (column_id) columnId = (await assertColumnUsable(db, task.project_id, column_id, task.column_id)).id;
  else if (status && status !== task.status) columnId = await columnForStatus(db, task.project_id, status);

  const position = await positionFor(db, task.project_id, columnId, {
    afterRef: after_id,
    beforeRef: before_id,
    excludeId: task.id,
  });

  // The status follows the column (a database trigger sets it).
  const { data, error } = await db
    .from("task")
    .update({ column_id: columnId, position })
    .eq("id", task.id)
    .eq("version", version)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw versionConflict();
  return json({ data: serializeTask(data as unknown as TaskRow) });
});
