import type { Database } from "@/lib/supabase/database.types";

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

export function serializeComment(row: CommentRow) {
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
  };
}
