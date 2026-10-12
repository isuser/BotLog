import { fromPostgrest } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";
import { getTaskRow, serializeTask, TASK_SELECT, type TaskRow } from "@/lib/api/tasks";

type Params = { id: string };

export const POST = route<Params>(async ({ db, params }) => {
  const task = await getTaskRow(db, params.id);
  if (!task.archived_at) return json({ data: serializeTask(task) });

  const { data, error } = await db
    .from("task")
    .update({ archived_at: null })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeTask(data as unknown as TaskRow) });
});
