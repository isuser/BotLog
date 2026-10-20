import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { authenticate, type ApiContext } from "./auth";
import { ApiError, errorResponse } from "./errors";
import { enforceRateLimit } from "./rate-limit";

type Params = Record<string, string | string[] | undefined>;

type Handler<P extends Params> = (
  ctx: ApiContext & { request: NextRequest; params: P; url: URL },
) => Promise<Response>;

/**
 * Wraps a Route Handler: authenticates the caller, counts the request against their rate
 * limit, and turns thrown errors into the standard `{ error: { code, message } }` response.
 *
 * Reads count in parallel with the handler, saving a database round trip; if the limit is
 * used up, the result is thrown away and the answer is still 429. Writes count first, so a
 * write over the limit never runs.
 */
export function route<P extends Params = Params>(
  handler: Handler<P>,
  options: { allowApiKey?: boolean } = {},
) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    try {
      const api = await authenticate(request, options);
      const run = async () => handler({ ...api, request, params: await context.params, url: request.nextUrl });
      if (!isRead(request.method)) {
        await enforceRateLimit(api.db, api.actor);
        return await run();
      }
      const [limit, response] = await Promise.allSettled([enforceRateLimit(api.db, api.actor), run()]);
      if (limit.status === "rejected") throw limit.reason;
      if (response.status === "rejected") throw response.reason;
      return response.value;
    } catch (error) {
      // Let Next.js handle its own control-flow errors (e.g. opting out of prerendering).
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

const isRead = (method: string) => method === "GET" || method === "HEAD";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** Parses and validates a JSON body, answering 400 with the problems found. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("bad_request", "The request body must be JSON.");
  }
  return parseWith(schema, body);
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      "bad_request",
      "The request is invalid.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}
