"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error: string | null; sent: boolean; email: string };

// Reset emails per hour. Low on purpose: Supabase's built-in sender has a small hourly quota
// shared by the whole project, and nobody needs more than a couple of reset links.
const PER_EMAIL = 3;
const PER_IP = 10;

/**
 * Sends a password reset email. The answer is the same, and comes back just as fast, whether
 * or not the account exists, is on the allowlist or is rate limited: the work happens after
 * the response, so the form doesn't reveal who has an account.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email.", sent: false, email };

  const ip = clientIp(await headers());
  const supabase = await createClient();

  after(async () => {
    if (!(await underLimits(email, ip))) return;
    if (!isEmailAllowed(email)) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) console.error("Password reset email failed", error.status, error.code);
  });

  return { error: null, sent: true, email };
}

function clientIp(h: Headers): string {
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Counts this request per email and per IP (both always, so timing doesn't differ). */
async function underLimits(email: string, ip: string): Promise<boolean> {
  try {
    // The service role is only for this counter; the form is used signed out, so there is
    // no user token to count against.
    const admin = createAdminClient();
    const emailHash = createHash("sha256").update(email).digest("hex");
    const [byEmail, byIp] = await Promise.all([
      admin.rpc("hit_password_reset_limit", { p_bucket: `email:${emailHash}` }),
      admin.rpc("hit_password_reset_limit", { p_bucket: `ip:${ip.slice(0, 64)}` }),
    ]);
    if (byEmail.error || byIp.error) throw byEmail.error ?? byIp.error;
    return byEmail.data <= PER_EMAIL && byIp.data <= PER_IP;
  } catch (error) {
    // Like the API limiter: a broken counter shouldn't stop people resetting their password.
    console.error("Password reset rate limit check failed; allowing the request", error);
    return true;
  }
}
