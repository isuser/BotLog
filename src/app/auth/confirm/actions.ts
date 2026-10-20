"use server";

import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { emailLinkType } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

export type ConfirmState = { error: string | null };

const INVALID = "This link has expired or was already used. Ask for a new one.";

/**
 * Exchanges the token from an invite or password reset email for a session, then sends the
 * user to choose a password. Runs on a button press rather than on page load, so email
 * scanners that open links don't use up the one-time token.
 */
export async function confirmEmailLink(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const type = emailLinkType(formData.get("type"));
  const tokenHash = String(formData.get("token_hash") ?? "");
  if (!type || !tokenHash) return { error: INVALID };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return { error: INVALID };

  if (!isEmailAllowed(data.user.email)) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error("Signing out a user not on the allowlist failed", signOutError.status);
    return { error: "This account doesn't have access to this Botlog instance." };
  }

  redirect("/set-password");
}
