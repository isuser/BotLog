import { assertCanDelete, assertCanEdit, COMMENT_SELECT, getCommentRow, serializeComment } from "@/lib/api/comments";
import { fromPostgrest, notFound } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { updateCommentSchema } from "@/lib/api/schemas";

type Params = { id: string };
type CommentRow = Parameters<typeof serializeComment>[0];

export const GET = route<Params>(async ({ db, actor, params }) => {
  return json({ data: serializeComment(await getCommentRow(db, params.id), actor) });
});

/** Replaces the body. Only the author can; an unchanged body is left alone (not marked edited). */
export const PATCH = route<Params>(async ({ db, actor, request, params }) => {
  const { body } = await parseBody(request, updateCommentSchema);
  const comment = await getCommentRow(db, params.id);
  assertCanEdit(comment, actor);
  if (body === comment.body) return json({ data: serializeComment(comment, actor) });

  const { data, error } = await db
    .from("comment")
    .update({ body })
    .eq("id", comment.id)
    .select(COMMENT_SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Comment");
  return json({ data: serializeComment(data as unknown as CommentRow, actor) });
});

/** Deletes the comment for good; the task's activity records that it was deleted, not what it said. */
export const DELETE = route<Params>(async ({ db, actor, params }) => {
  const comment = await getCommentRow(db, params.id);
  assertCanDelete(comment, actor);
  const { data, error } = await db.from("comment").delete().eq("id", comment.id).select("id");
  if (error) throw fromPostgrest(error);
  if (!data.length) throw notFound("Comment");
  return json({ data: serializeComment(comment, actor) });
});
