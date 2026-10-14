import { assertEpicUsable } from "@/lib/api/epics";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, parseWith, route } from "@/lib/api/handler";
import { replaceTaskLabels, resolveLabelIds } from "@/lib/api/labels";
import { resolveProjectId } from "@/lib/api/projects";
import { createTaskSchema, taskListFilters } from "@/lib/api/schemas";
import { listTasks } from "@/lib/api/task-list";
import { assigneeColumns, getTaskRow, positionFor, serializeTask } from "@/lib/api/tasks";
import type { Database } from "@/lib/supabase/database.types";

type Params = { id: string };

export const GET = route<Params>(async ({ db, actor, url, params }) => {
  const filters = parseWith(taskListFilters, Object.fromEntries(url.searchParams));
  const projectId = await resolveProjectId(db, params.id);
  return json(await listTasks(db, actor, url, filters, { projectId }));
});

/** Creates a task at the top of its status column (backlog by default), with optional epic and labels. */
export const POST = route<Params>(async ({ db, request, params }) => {
  const { assignee, label_ids, ...fields } = await parseBody(request, createTaskSchema);
  const projectId = await resolveProjectId(db, params.id);
  const status = fields.status ?? "backlog";
  if (fields.epic_id) await assertEpicUsable(db, projectId, fields.epic_id);
  const labelIds = label_ids && (await resolveLabelIds(db, projectId, label_ids));

  // number, version and the author fields are set by database triggers.
  const insert = {
    ...fields,
    ...(assignee === undefined ? {} : assigneeColumns(assignee)),
    project_id: projectId,
    status,
    position: await positionFor(db, projectId, status),
  } as Omit<Database["public"]["Tables"]["task"]["Insert"], "number"> as Database["public"]["Tables"]["task"]["Insert"];

  const { data, error } = await db.from("task").insert(insert).select("id, version").single();
  if (error) throw fromPostgrest(error);
  if (labelIds?.length) await replaceTaskLabels(db, data.id, data.version, labelIds);
  return json({ data: serializeTask(await getTaskRow(db, data.id)) }, 201);
});
