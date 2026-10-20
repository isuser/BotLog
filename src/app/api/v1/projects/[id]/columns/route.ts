import { activeTaskCount, COLUMN_SELECT, columnPosition, projectColumns, serializeColumn } from "@/lib/api/columns";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { resolveProjectId } from "@/lib/api/projects";
import { createColumnSchema } from "@/lib/api/schemas";

type Params = { id: string };

/** A project's columns in board order, hidden ones included, with their active task counts. */
export const GET = route<Params>(async ({ db, url, params }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);
  const projectId = await resolveProjectId(db, params.id);

  let query = activeTaskCount(db.from("board_column").select(COLUMN_SELECT)).eq("project_id", projectId);
  if (cursor) query = query.or(keysetFilter(["position", "id"], cursor));
  const { data, error } = await query.order("position").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data, limit, (row) => [row.position, row.id]);
  return json({ data: result.data.map(serializeColumn), next_cursor: result.next_cursor });
});

/**
 * Adds a custom column, by default just before Done. It counts as To do if it lands before
 * In progress, else In progress. People only: agents move tasks between columns but don't
 * manage them.
 */
export const POST = route<Params>(
  async ({ db, request, params }) => {
    const { after_id, before_id, ...fields } = await parseBody(request, createColumnSchema);
    const projectId = await resolveProjectId(db, params.id);
    const position = columnPosition(await projectColumns(db, projectId), { afterId: after_id, beforeId: before_id });
    const { data, error } = await activeTaskCount(
      db
        .from("board_column")
        .insert({ ...fields, project_id: projectId, position })
        .select(COLUMN_SELECT),
    ).single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeColumn(data) }, 201);
  },
  { allowApiKey: false },
);
