import { AGENT_SELECT, serializeAgent } from "@/lib/api/agents";
import { fromPostgrest } from "@/lib/api/errors";
import { json, parseWith, route } from "@/lib/api/handler";
import { decodeCursor, keysetFilter, page, parseLimit } from "@/lib/api/pagination";
import { resolveProjectId } from "@/lib/api/projects";
import { agentListFilters } from "@/lib/api/schemas";

type Params = { id: string };

/**
 * The agents of everyone in the project, each with its owner, oldest first: who besides the
 * members can be assigned its tasks. Archived ones only with `?archived=true`.
 */
export const GET = route<Params>(async ({ db, url, params }) => {
  const { archived } = parseWith(agentListFilters, Object.fromEntries(url.searchParams));
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 2);
  const projectId = await resolveProjectId(db, params.id);

  const members = await db.from("project_member").select("user_id").eq("project_id", projectId);
  if (members.error) throw fromPostgrest(members.error);
  const ownerIds = members.data.map((m) => m.user_id);
  if (ownerIds.length === 0) return json({ data: [], next_cursor: null });

  let query = db.from("agent").select(AGENT_SELECT).in("owner_user_id", ownerIds);
  query = archived === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (cursor) query = query.or(keysetFilter(["created_at", "id"], cursor));
  const { data, error } = await query.order("created_at").order("id").limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data, limit, (row) => [row.created_at, row.id]);
  return json({ data: result.data.map(serializeAgent), next_cursor: result.next_cursor });
});
