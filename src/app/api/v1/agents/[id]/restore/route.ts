import { assertOwner, getAgentRow, serializeAgent, updateAgent } from "@/lib/api/agents";
import { json, route } from "@/lib/api/handler";

type Params = { id: string };

export const POST = route<Params>(
  async ({ db, actor, params }) => {
    const agent = await getAgentRow(db, params.id);
    assertOwner(agent, actor.userId);
    if (!agent.archived_at) return json({ data: serializeAgent(agent) });
    return json({ data: await updateAgent(db, agent.id, { archived_at: null }) });
  },
  { allowApiKey: false },
);
