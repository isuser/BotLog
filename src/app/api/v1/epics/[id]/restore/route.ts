import { getEpicRow, serializeEpic } from "@/lib/api/epics";
import { fromPostgrest } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";

type Params = { id: string };

export const POST = route<Params>(async ({ db, params }) => {
  const epic = await getEpicRow(db, params.id);
  if (!epic.archived_at) return json({ data: serializeEpic(epic) });
  const { error } = await db.from("epic").update({ archived_at: null }).eq("id", epic.id);
  if (error) throw fromPostgrest(error);
  return json({ data: serializeEpic(await getEpicRow(db, epic.id)) });
});
