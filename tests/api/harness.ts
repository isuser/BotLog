import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export const TEST_EMAIL_PREFIX = "botlog-test-";

const url = () => required("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing: the API tests need .env.local (see .env.example).`);
  return value;
}

/** Service-role client, for creating and deleting test users only. */
export function adminClient() {
  return createClient<Database>(url(), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; token: string; db: SupabaseClient<Database> };

/** A confirmed user with a fresh workspace, signed in. */
export async function createTestUser(): Promise<TestUser> {
  const email = `${TEST_EMAIL_PREFIX}${randomBytes(6).toString("hex")}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;

  const auth = createClient<Database>(url(), publishableKey(), { auth: { persistSession: false } });
  const { data: session, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const token = session.session.access_token;

  const db = createClient<Database>(url(), publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { id: data.user.id, email, token, db };
}

/** Deletes test users (and, through the database, their workspaces and data). */
export async function deleteTestUsers(ids?: string[]) {
  const admin = adminClient();
  let toDelete = ids;
  if (!toDelete) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    toDelete = data.users.filter((u) => u.email?.startsWith(TEST_EMAIL_PREFIX)).map((u) => u.id);
  }
  for (const id of toDelete) await admin.auth.admin.deleteUser(id);
}

type RouteHandler = (request: NextRequest, context: { params: Promise<never> }) => Response | Promise<Response>;

/** Calls a Route Handler directly, the way Next.js would. */
export async function call(
  handler: RouteHandler,
  {
    path = "/api/v1",
    params = {},
    token,
    body,
    method = "GET",
  }: { path?: string; params?: Record<string, string>; token?: string; body?: unknown; method?: string },
) {
  const request = new NextRequest(new URL(path, "http://localhost"), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) as Promise<never> });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  return { status: response.status, body: json, headers: response.headers };
}

/** Whether the JWT signing key in .env.local has been imported into the project. */
export async function signingKeyIsLive(): Promise<boolean> {
  const raw = process.env.SUPABASE_JWT_SIGNING_KEY;
  if (!raw?.startsWith("{")) return Boolean(raw);
  const kid = JSON.parse(raw).kid;
  const response = await fetch(`${url()}/auth/v1/.well-known/jwks.json`);
  const { keys } = (await response.json()) as { keys: { kid: string }[] };
  return keys.some((key) => key.kid === kid);
}
