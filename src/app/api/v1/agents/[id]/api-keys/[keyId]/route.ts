import { API_KEY_SELECT, assertOwner, getAgentRow, getApiKeyRow, serializeApiKey } from "@/lib/api/agents";
import { fromPostgrest } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";

type Params = { id: string; keyId: string };

/** Revokes the key for good. Revoked keys stay listed so past activity can be traced. */
export const DELETE = route<Params>(
  async ({ db, actor, params }) => {
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);
    const apiKey = await getApiKeyRow(db, agent.id, params.keyId);
    if (apiKey.revoked_at) return json({ data: serializeApiKey(apiKey) });

    const { data, error } = await db
      .from("api_key")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .select(API_KEY_SELECT)
      .single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeApiKey(data) });
  },
  { allowApiKey: false },
);
