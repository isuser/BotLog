import { COMMENT_SELECT, serializeComment } from "@/lib/api/comments";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { createCommentSchema } from "@/lib/api/schemas";
import { getTaskRow } from "@/lib/api/tasks";

type Params = { id: string };
type CommentRow = Parameters<typeof serializeComment>[0];

/** Comments on a task, oldest first. */
export const GET = route<Params>(async ({ db, actor, url, params }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);
  const task = await getTaskRow(db, params.id);

  let query = db.from("comment").select(COMMENT_SELECT).eq("task_id", task.id);
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data as unknown as CommentRow[], limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map((row) => serializeComment(row, actor)), next_cursor: result.next_cursor });
});

/** The author is whoever is calling: the signed-in user, or the agent behind the API key. */
export const POST = route<Params>(async ({ db, actor, request, params }) => {
  const { body } = await parseBody(request, createCommentSchema);
  const task = await getTaskRow(db, params.id);

  const { data, error } = await db
    .from("comment")
    .insert({ task_id: task.id, body })
    .select(COMMENT_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return json({ data: serializeComment(data as unknown as CommentRow, actor) }, 201);
});
