import { AGENT_SELECT, serializeAgent } from "@/lib/api/agents";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, parseWith, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { agentListFilters, createAgentSchema } from "@/lib/api/schemas";

/** Agents in the workspace, oldest first. Archived ones only with `?archived=true`. */
export const GET = route(async ({ db, url }) => {
  const { archived } = parseWith(agentListFilters, Object.fromEntries(url.searchParams));
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);

  let query = db.from("agent").select(AGENT_SELECT);
  query = archived === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data, limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map(serializeAgent), next_cursor: result.next_cursor });
});

/** Creates an agent owned by the caller. Agents can't create agents. */
export const POST = route(
  async ({ db, request }) => {
    const body = await parseBody(request, createAgentSchema);
    const { data, error } = await db.from("agent").insert(body).select(AGENT_SELECT).single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeAgent(data) }, 201);
  },
  { allowApiKey: false },
);
