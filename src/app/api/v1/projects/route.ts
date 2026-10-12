import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { getProject, PROJECT_SELECT, serializeProject, withTaskCounts } from "@/lib/api/projects";
import { createProjectSchema } from "@/lib/api/schemas";

/** Projects in the caller's workspace, oldest first, with task counts. */
export const GET = route(async ({ db, url }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);

  let query = withTaskCounts(db.from("project").select(PROJECT_SELECT));
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const rows = data as unknown as Parameters<typeof serializeProject>[0][];
  const result = page(rows, limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map(serializeProject), next_cursor: result.next_cursor });
});

export const POST = route(async ({ db, request }) => {
  const body = await parseBody(request, createProjectSchema);
  const { data, error } = await db.from("project").insert(body).select("key").single();
  if (error) throw fromPostgrest(error);
  return json({ data: await getProject(db, data.key) }, 201);
});
