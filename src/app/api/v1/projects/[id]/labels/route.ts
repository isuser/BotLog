import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { LABEL_SELECT, serializeLabel } from "@/lib/api/labels";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { resolveProjectId } from "@/lib/api/projects";
import { createLabelSchema } from "@/lib/api/schemas";

type Params = { id: string };

/** A project's labels, by name. */
export const GET = route<Params>(async ({ db, url, params }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);
  const projectId = await resolveProjectId(db, params.id);

  let query = db.from("label").select(LABEL_SELECT).eq("project_id", projectId);
  if (cursor) query = query.or(keysetFilter(["name", "id"], cursor));
  const { data, error } = await query.order("name").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data, limit, (row) => [row.name, row.id]);
  return json({ data: result.data.map(serializeLabel), next_cursor: result.next_cursor });
});

/** Creates a label. Names are unique in the project, ignoring case. */
export const POST = route<Params>(async ({ db, request, params }) => {
  const body = await parseBody(request, createLabelSchema);
  const projectId = await resolveProjectId(db, params.id);
  const { data, error } = await db
    .from("label")
    .insert({ ...body, project_id: projectId })
    .select(LABEL_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeLabel(data) }, 201);
});
