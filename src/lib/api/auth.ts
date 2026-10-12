import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { signAgentToken } from "./agent-token";
import { hashApiKey, isApiKey } from "./api-keys";
import { ApiError } from "./errors";

export type Db = SupabaseClient<Database>;

export type Actor =
  | { type: "user"; userId: string; email: string }
  | { type: "agent"; userId: string; agentId: string; apiKeyId: string };

/** Who is calling, and a database client that acts as them (RLS applies). */
export type ApiContext = { actor: Actor; db: Db };

const unauthorized = (message = "Sign in or send an API key as a Bearer token.") =>
  new ApiError("unauthorized", message);

/** How often last_used_at is written; finer tracking isn't worth a write per request. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Authenticates an API request from, in order:
 * - `Authorization: Bearer bl_...`: an agent API key
 * - `Authorization: Bearer <jwt>`: a Supabase access token (scripts, tests)
 * - the session cookie set by signing in to the web app
 */
export async function authenticate(
  request: Request,
  { allowApiKey = true }: { allowApiKey?: boolean } = {},
): Promise<ApiContext> {
  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) throw unauthorized();
    if (isApiKey(token)) {
      if (!allowApiKey) {
        throw new ApiError("forbidden", "This endpoint needs a signed-in user, not an API key.");
      }
      return authenticateApiKey(token);
    }
    return authenticateAccessToken(token);
  }
  // Supabase session cookies are named sb-<project>-auth-token(.N); no cookie, no session.
  if (!request.headers.get("cookie")?.includes("sb-")) throw unauthorized();
  if (!isSafeMethod(request.method) && !isSameOrigin(request)) {
    throw new ApiError("forbidden", "Cross-site requests can't use the session cookie.");
  }
  return authenticateSession();
}

const isSafeMethod = (method: string) => method === "GET" || method === "HEAD" || method === "OPTIONS";

/**
 * Cookie-authenticated writes must come from this site. SameSite=Lax cookies already stop
 * most cross-site requests; this is a second check against CSRF.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function authenticateSession(): Promise<ApiContext> {
  const db = await createSessionClient();
  const { data } = await db.auth.getClaims();
  return { actor: userActor(data?.claims), db };
}

async function authenticateAccessToken(token: string): Promise<ApiContext> {
  const db = clientWithToken(token);
  const { data, error } = await db.auth.getClaims(token);
  if (error) throw unauthorized("Invalid or expired access token.");
  return { actor: userActor(data?.claims), db };
}

function userActor(claims: Record<string, unknown> | undefined): Actor {
  const sub = claims?.sub;
  const email = claims?.email;
  // Agent tokens are minted per request from an API key and never accepted directly.
  if (typeof sub !== "string" || typeof email !== "string" || claims?.agent_id) throw unauthorized();
  if (!isEmailAllowed(email)) throw new ApiError("forbidden", "This account doesn't have access.");
  return { type: "user", userId: sub, email };
}

async function authenticateApiKey(key: string): Promise<ApiContext> {
  const admin = createAdminClient();
  const { data: apiKey, error } = await admin
    .from("api_key")
    .select(
      "id, revoked_at, last_used_at, agent:agent!inner(id, archived_at, owner:profile!agent_owner_user_id_fkey(id, email))",
    )
    .eq("hash", hashApiKey(key))
    .maybeSingle();

  if (error) throw new ApiError("internal", "Could not check the API key.");
  const agent = apiKey?.agent;
  const owner = agent?.owner;
  if (!apiKey || !agent || !owner || apiKey.revoked_at || agent.archived_at) {
    throw unauthorized("Invalid or revoked API key.");
  }
  // An agent never has more access than its owner, including the allowlist.
  if (!isEmailAllowed(owner.email)) throw new ApiError("forbidden", "This agent's owner doesn't have access.");

  const lastUsed = apiKey.last_used_at ? Date.parse(apiKey.last_used_at) : 0;
  if (Date.now() - lastUsed > LAST_USED_RESOLUTION_MS) {
    await admin.from("api_key").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
  }

  const actor = { type: "agent", userId: owner.id, agentId: agent.id, apiKeyId: apiKey.id } as const;
  const token = await signAgentToken(actor);
  return { actor, db: clientWithToken(token) };
}

function clientWithToken(token: string): Db {
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
