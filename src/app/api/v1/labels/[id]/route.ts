import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { getLabelRow, LABEL_SELECT, serializeLabel } from "@/lib/api/labels";
import { updateLabelSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: serializeLabel(await getLabelRow(db, params.id)) });
});

export const PATCH = route<Params>(async ({ db, request, params }) => {
  const body = await parseBody(request, updateLabelSchema);
  const label = await getLabelRow(db, params.id);
  const { data, error } = await db.from("label").update(body).eq("id", label.id).select(LABEL_SELECT).single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeLabel(data) });
});

/** Deletes the label and removes it from its tasks (each removal is logged on the task). */
export const DELETE = route<Params>(async ({ db, params }) => {
  const label = await getLabelRow(db, params.id);
  const { error } = await db.from("label").delete().eq("id", label.id);
  if (error) throw fromPostgrest(error);
  return json({ data: serializeLabel(label) });
});
