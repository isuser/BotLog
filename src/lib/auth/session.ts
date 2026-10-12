import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "./allowlist";

export type SessionUser = { id: string; email: string };

/**
 * The signed-in user from the session cookie, or null. Verifies the token and enforces
 * ALLOWED_EMAILS, so callers can trust the result.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.email || !isEmailAllowed(claims.email)) return null;
  return { id: claims.sub, email: claims.email };
}

/** Like getSessionUser, but sends signed-out users to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
