"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { passwordProblem, signedInByEmailLink } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

export async function setPassword(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const supabase = await createClient();

  // Straight from an invite or reset link the current password isn't needed (there may not
  // be one). Any other session has to prove it knows it.
  const { data } = await supabase.auth.getClaims();
  if (!signedInByEmailLink(data?.claims.amr)) {
    const current = String(formData.get("current") ?? "");
    if (!current) return { error: "Enter your current password." };
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (error) {
      if (error.status === 429) return { error: "Too many attempts. Try again in a few minutes." };
      return { error: "Your current password is wrong." };
    }
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: error.message };
    if (error.status === 429) return { error: "Too many attempts. Try again in a few minutes." };
    console.error("Setting a password failed", error.status, error.code);
    return { error: "Couldn't save your password. Try again." };
  }

  // A new password should lock out anyone else holding an old session.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) console.error("Signing out other sessions failed", signOutError.status, signOutError.code);

  redirect("/");
}
