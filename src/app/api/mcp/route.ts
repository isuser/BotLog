import { createMcpHandler } from "@modelcontextprotocol/server";
import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { createBotlogServer } from "@/lib/mcp/server";

/**
 * The remote MCP server. AI clients connect to /api/mcp and send their agent's API key as
 * `Authorization: Bearer bl_...`. Each request gets a fresh, stateless server whose tools
 * call the REST API as that agent.
 */
const handler = createMcpHandler(
  ({ authInfo }) => {
    const agentId = authInfo?.clientId;
    if (!authInfo || !agentId) throw new Error("MCP request without an authenticated agent");
    return createBotlogServer({ apiKey: authInfo.token, agentId });
  },
  {
    // Tools answer with one result; nothing streams, so plain JSON responses are enough.
    responseMode: "json",
    // No realtime in Botlog yet. Without this, any agent could hold open the handler's shared
    // pool of long-lived subscriptions/listen streams and starve everyone else.
    maxSubscriptions: 0,
    onerror: (error) => console.error("MCP error", error),
  },
);

async function serve(request: NextRequest): Promise<Response> {
  try {
    const { actor } = await authenticate(request);
    if (actor.type !== "agent") {
      throw new ApiError("unauthorized", "The MCP server needs an agent API key: Authorization: Bearer bl_...");
    }
    const token = request.headers.get("authorization")!.split(" ")[1];
    return await handler.fetch(request, {
      authInfo: { token, clientId: actor.agentId, scopes: [] },
    });
  } catch (error) {
    unstable_rethrow(error);
    const response = errorResponse(error);
    if (response.status === 401) response.headers.set("www-authenticate", 'Bearer realm="botlog"');
    return response;
  }
}

export { serve as DELETE, serve as GET, serve as POST };
