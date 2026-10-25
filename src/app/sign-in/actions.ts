"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { googleSignInEnabled } from "@/lib/auth/google";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/** `redirectTo` is set once signed in: the form then loads it as a new page. */
export type SignInState = { error: string | null; email: string; redirectTo?: string };

// Same message for unknown emails, wrong passwords and emails not on the allowlist, so
// the form doesn't reveal who has an account.
const INVALID = "Wrong email or password.";

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password.", email };
  if (!isEmailAllowed(email)) return { error: INVALID, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const tooMany = error.status === 429;
    return { error: tooMany ? "Too many attempts. Try again in a few minutes." : INVALID, email };
  }

  // Not redirect(): that navigates within the tab, which could still hold an earlier session's
  // cached data (for example after it expired). The form loads the app as a new page instead.
  return { error: null, email, redirectTo: safeRedirectPath(formData.get("next")) };
}

/** Starts "Continue with Google": Supabase sends the browser to Google, then to /auth/callback. */
export async function signInWithGoogle() {
  if (!googleSignInEnabled()) redirect("/sign-in");

  // Server Actions only run for same-origin requests, so Origin is this site's address.
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/sign-in?error=oauth");
  // No ?next: the URL must match Supabase's Redirect URLs exactly, so Google sign-in lands on /.
  const callback = new URL("/auth/callback", origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) {
    console.error("Starting Google sign-in failed", error?.status, error?.code);
    redirect("/sign-in?error=oauth");
  }
  redirect(data.url);
}
