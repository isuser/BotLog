import { assertOwner, getAgentRow, serializeAgent, updateAgent } from "@/lib/api/agents";
import { ApiError } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { updateAgentSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: serializeAgent(await getAgentRow(db, params.id)) });
});

export const PATCH = route<Params>(
  async ({ db, actor, request, params }) => {
    const body = await parseBody(request, updateAgentSchema);
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);
    if (agent.archived_at) throw new ApiError("archived", "This agent is archived. Restore it to edit it.");
    return json({ data: await updateAgent(db, agent.id, body) });
  },
  { allowApiKey: false },
);

/**
 * Archives the agent. Its API keys stop working until it's restored, and it keeps its
 * place in task assignments, comments and activity.
 */
export const DELETE = route<Params>(
  async ({ db, actor, params }) => {
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);
    if (agent.archived_at) return json({ data: serializeAgent(agent) });
    return json({ data: await updateAgent(db, agent.id, { archived_at: new Date().toISOString() }) });
  },
  { allowApiKey: false },
);
