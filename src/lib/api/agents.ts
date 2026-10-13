import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

export const AGENT_SELECT = "id, name, description, avatar, owner_user_id, archived_at, created_at, updated_at";

// Never `hash`: it isn't readable by clients, and selecting it fails.
export const API_KEY_SELECT = "id, agent_id, name, prefix, last_used_at, revoked_at, created_at";

type AgentRow = {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  owner_user_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApiKeyRow = {
  id: string;
  agent_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function serializeAgent(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    owner_user_id: row.owner_user_id,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    name: row.name,
    prefix: row.prefix,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

function assertUuid(id: string, what: string) {
  if (!isUuid(id)) throw notFound(what);
}

export async function getAgentRow(db: Db, id: string): Promise<AgentRow> {
  assertUuid(id, "Agent");
  const { data, error } = await db.from("agent").select(AGENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Agent");
  return data;
}

/** Only an agent's owner can change it or manage its keys; RLS enforces it, this explains it. */
export function assertOwner(agent: AgentRow, userId: string) {
  if (agent.owner_user_id !== userId) {
    throw new ApiError("forbidden", "Only the agent's owner can manage it.");
  }
}

export async function updateAgent(db: Db, id: string, fields: Partial<Pick<AgentRow, "name" | "description" | "avatar" | "archived_at">>) {
  const { data, error } = await db.from("agent").update(fields).eq("id", id).select(AGENT_SELECT).single();
  if (error) throw fromPostgrest(error);
  return serializeAgent(data);
}

export async function getApiKeyRow(db: Db, agentId: string, keyId: string): Promise<ApiKeyRow> {
  assertUuid(keyId, "API key");
  const { data, error } = await db
    .from("api_key")
    .select(API_KEY_SELECT)
    .eq("id", keyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("API key");
  return data;
}
