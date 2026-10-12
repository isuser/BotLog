import { fromPostgrest, versionConflict } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { moveTaskSchema } from "@/lib/api/schemas";
import { assertNotArchived, getTaskRow, positionFor, serializeTask, TASK_SELECT, type TaskRow } from "@/lib/api/tasks";

type Params = { id: string };

/** Changes a task's status and/or position in its column. */
export const POST = route<Params>(async ({ db, request, params }) => {
  const body = await parseBody(request, moveTaskSchema);
  const task = await getTaskRow(db, params.id);
  assertNotArchived(task);
  if (task.version !== body.version) throw versionConflict();

  const status = body.status ?? task.status;
  const position = await positionFor(db, task.project_id, status, {
    afterRef: body.after_id,
    beforeRef: body.before_id,
    excludeId: task.id,
  });

  const { data, error } = await db
    .from("task")
    .update({ status, position })
    .eq("id", task.id)
    .eq("version", body.version)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw versionConflict();
  return json({ data: serializeTask(data as unknown as TaskRow) });
});
