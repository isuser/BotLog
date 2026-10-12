"use server";

import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

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

  redirect(safeRedirectPath(formData.get("next")));
}
