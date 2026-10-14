import { assertEpicNotArchived, getEpicRow, serializeEpic } from "@/lib/api/epics";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { updateEpicSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: serializeEpic(await getEpicRow(db, params.id)) });
});

export const PATCH = route<Params>(async ({ db, request, params }) => {
  const body = await parseBody(request, updateEpicSchema);
  const epic = await getEpicRow(db, params.id);
  assertEpicNotArchived(epic);
  const { error } = await db.from("epic").update(body).eq("id", epic.id);
  if (error) throw fromPostgrest(error);
  return json({ data: serializeEpic(await getEpicRow(db, epic.id)) });
});

/** Archives the epic. Its tasks keep their place in it; it can be restored. */
export const DELETE = route<Params>(async ({ db, params }) => {
  const epic = await getEpicRow(db, params.id);
  if (epic.archived_at) return json({ data: serializeEpic(epic) });
  const { error } = await db.from("epic").update({ archived_at: new Date().toISOString() }).eq("id", epic.id);
  if (error) throw fromPostgrest(error);
  return json({ data: serializeEpic(await getEpicRow(db, epic.id)) });
});
