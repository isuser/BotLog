import "server-only";
import { NextRequest } from "next/server";

type Params = Record<string, string>;
type RouteHandler<P extends Params> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>;

/** An API answer that wasn't a 2xx, kept in the API's own `{ error }` shape. */
export class McpApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error: { code: string; message: string; details?: unknown } },
  ) {
    super(body.error.message);
  }
}

type CallOptions<P> = {
  method?: string;
  params?: P;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

/**
 * Calls a REST API route handler in-process as the agent behind `apiKey`, so MCP tools go
 * through exactly the same auth, validation, RLS and version checks as any API client.
 */
export async function callApi<P extends Params>(
  handler: RouteHandler<P>,
  apiKey: string,
  options: CallOptions<P> = {},
): Promise<unknown> {
  const response = await callApiResponse(handler, apiKey, options);
  const json = await response.json().catch(() => null);
  if (!response.ok) throw apiError(response.status, json);
  return json;
}

/** Like `callApi`, for routes that don't answer with JSON (a redirect): returns the response. Errors still throw. */
export async function callApiResponse<P extends Params>(
  handler: RouteHandler<P>,
  apiKey: string,
  { method = "GET", params = {} as P, query = {}, body }: CallOptions<P> = {},
): Promise<Response> {
  const url = new URL("http://botlog.internal/api/v1");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const request = new NextRequest(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const response = await handler(request, { params: Promise.resolve(params) });
  if (response.status >= 400) throw apiError(response.status, await response.json().catch(() => null));
  return response;
}

function apiError(status: number, json: { error?: unknown } | null) {
  return new McpApiError(
    status,
    json?.error ? (json as McpApiError["body"]) : { error: { code: "internal", message: "Something went wrong." } },
  );
}
