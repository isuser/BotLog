import type { Database } from "@/lib/supabase/database.types";
import type { Actor, Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

export const COMMENT_SELECT = `
  id, task_id, body, created_at, updated_at,
  author_user:profile!comment_author_user_id_fkey(id, name, email),
  author_agent:agent!comment_author_agent_id_fkey(id, name, avatar)
`;

type CommentRow = Pick<
  Database["public"]["Tables"]["comment"]["Row"],
  "id" | "task_id" | "body" | "created_at" | "updated_at"
> & {
  author_user: { id: string; name: string; email: string } | null;
  author_agent: { id: string; name: string; avatar: string | null } | null;
};

/**
 * Only the author edits a comment. People delete their own and any comment that isn't
 * another person's (agents', or one whose author was deleted); agents delete none. RLS
 * enforces the same rules.
 */
function permissions(row: CommentRow, actor: Actor) {
  const canEdit =
    actor.type === "agent" ? row.author_agent?.id === actor.agentId : row.author_user?.id === actor.userId;
  const canDelete = actor.type === "user" && (!row.author_user || row.author_user.id === actor.userId);
  return { can_edit: canEdit, can_delete: canDelete };
}

/** A comment, with what the caller may do with it. */
export function serializeComment(row: CommentRow, actor: Actor) {
  return {
    id: row.id,
    task_id: row.task_id,
    body: row.body,
    author: row.author_user
      ? { type: "user" as const, ...row.author_user }
      : row.author_agent
        ? { type: "agent" as const, ...row.author_agent }
        : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Only edits change a comment, so a later updated_at means it was edited.
    edited_at: Date.parse(row.updated_at) > Date.parse(row.created_at) ? row.updated_at : null,
    ...permissions(row, actor),
  };
}

export async function getCommentRow(db: Db, id: string): Promise<CommentRow> {
  if (!isUuid(id)) throw new ApiError("bad_request", `"${id}" is not a comment ID. Use the comment's UUID.`);
  const { data, error } = await db.from("comment").select(COMMENT_SELECT).eq("id", id.toLowerCase()).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Comment");
  return data as unknown as CommentRow;
}

export function assertCanEdit(row: CommentRow, actor: Actor) {
  if (!permissions(row, actor).can_edit) {
    throw new ApiError("forbidden", "Only the comment's author can edit it.");
  }
}

export function assertCanDelete(row: CommentRow, actor: Actor) {
  if (!permissions(row, actor).can_delete) {
    throw new ApiError(
      "forbidden",
      actor.type === "agent" ? "Agents can't delete comments." : "You can't delete another person's comment.",
    );
  }
}
