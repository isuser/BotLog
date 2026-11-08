import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { getProject, narrowProjects, PROJECT_SELECT, serializeProject } from "@/lib/api/projects";
import { createProjectSchema } from "@/lib/api/schemas";

/** Projects the caller can see (their own and ones shared with them), oldest first, with task counts. */
export const GET = route(async ({ db, url, actor }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);

  let query = narrowProjects(db.from("project").select(PROJECT_SELECT), actor.userId);
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const rows = data as unknown as Parameters<typeof serializeProject>[0][];
  const result = page(rows, limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map(serializeProject), next_cursor: result.next_cursor });
});

export const POST = route(async ({ db, request, actor }) => {
  const body = await parseBody(request, createProjectSchema);
  const { data, error } = await db.from("project").insert(body).select("id").single();
  if (error) throw fromPostgrest(error);
  // By id: the key alone can match a shared project with the same key.
  return json({ data: await getProject(db, data.id, actor.userId) }, 201);
});
