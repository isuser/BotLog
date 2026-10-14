import { getEpicRow, selectEpics, serializeEpic } from "@/lib/api/epics";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, parseWith, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { resolveProjectId } from "@/lib/api/projects";
import { createEpicSchema, epicListFilters } from "@/lib/api/schemas";

type Params = { id: string };
type EpicRow = Parameters<typeof serializeEpic>[0];

/** A project's epics with progress, oldest first. Archived ones only with `?archived=true`. */
export const GET = route<Params>(async ({ db, url, params }) => {
  const filters = parseWith(epicListFilters, Object.fromEntries(url.searchParams));
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);
  const projectId = await resolveProjectId(db, params.id);

  let query = selectEpics(db).eq("project_id", projectId);
  query = filters.archived === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data as unknown as EpicRow[], limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map(serializeEpic), next_cursor: result.next_cursor });
});

export const POST = route<Params>(async ({ db, request, params }) => {
  const body = await parseBody(request, createEpicSchema);
  const projectId = await resolveProjectId(db, params.id);
  const { data, error } = await db
    .from("epic")
    .insert({ ...body, project_id: projectId })
    .select("id")
    .single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeEpic(await getEpicRow(db, data.id)) }, 201);
});
