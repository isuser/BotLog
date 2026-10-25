"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/** Ends the session. The caller then loads /sign-in as a new page (see SignOutButton). */
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (!error) return;
  // Supabase can fail before it clears anything (say Auth is unreachable while refreshing the
  // token), so delete this browser's session cookies here: nobody is left signed in on it.
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name.startsWith("sb-")) store.delete(name);
  }
}
