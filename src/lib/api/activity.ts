import type { Database } from "@/lib/supabase/database.types";

export const ACTIVITY_SELECT = `
  id, seq, entity_type, entity_id, action, actor_type, user_id, agent_id, api_key_id, changes, created_at,
  user:profile!activity_log_user_id_fkey(name),
  agent:agent!activity_log_agent_id_fkey(name)
`;

type ActivityRow = Pick<
  Database["public"]["Tables"]["activity_log"]["Row"],
  | "id"
  | "seq"
  | "entity_type"
  | "entity_id"
  | "action"
  | "actor_type"
  | "user_id"
  | "agent_id"
  | "api_key_id"
  | "changes"
  | "created_at"
> & { user: { name: string } | null; agent: { name: string } | null };

export function serializeActivity(row: ActivityRow) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    actor: {
      type: row.actor_type,
      // For AI changes user_id is the agent's owner.
      user_id: row.user_id,
      agent_id: row.agent_id,
      api_key_id: row.api_key_id,
      name: row.actor_type === "ai" ? (row.agent?.name ?? null) : (row.user?.name ?? null),
    },
    changes: row.changes,
    created_at: row.created_at,
  };
}
