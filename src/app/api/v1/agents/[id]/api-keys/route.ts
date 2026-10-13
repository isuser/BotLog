import { API_KEY_SELECT, assertOwner, getAgentRow, serializeApiKey } from "@/lib/api/agents";
import { generateApiKey } from "@/lib/api/api-keys";
import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, parseWith, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { apiKeyListFilters, createApiKeySchema } from "@/lib/api/schemas";

type Params = { id: string };

/** The agent's keys, oldest first, revoked ones included unless `?revoked=false`. */
export const GET = route<Params>(
  async ({ db, actor, params, url }) => {
    const { revoked } = parseWith(apiKeyListFilters, Object.fromEntries(url.searchParams));
    const limit = parseLimit(url.searchParams);
    const cursor = decodeCursor(url.searchParams, 2);
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);

    let query = db.from("api_key").select(API_KEY_SELECT).eq("agent_id", agent.id);
    if (revoked === "true") query = query.not("revoked_at", "is", null);
    if (revoked === "false") query = query.is("revoked_at", null);
    if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
    const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
    if (error) throw fromPostgrest(error);

    const result = page(data, limit, (row) => [row.created_at, row.id]);
    return json({ data: result.data.map(serializeApiKey), next_cursor: result.next_cursor });
  },
  { allowApiKey: false },
);

/** Creates a key. The full key is in this response only; Botlog stores just its hash. */
export const POST = route<Params>(
  async ({ db, actor, request, params }) => {
    const { name } = await parseBody(request, createApiKeySchema);
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);
    if (agent.archived_at) throw new ApiError("archived", "This agent is archived. Restore it to add keys.");

    const { key, prefix, hash } = generateApiKey();
    const { data, error } = await db
      .from("api_key")
      .insert({ agent_id: agent.id, name, prefix, hash })
      .select(API_KEY_SELECT)
      .single();
    if (error) throw fromPostgrest(error);
    return json({ data: { ...serializeApiKey(data), key } }, 201);
  },
  { allowApiKey: false },
);
