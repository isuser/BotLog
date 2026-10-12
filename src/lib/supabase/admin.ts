import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses RLS, so it is only for API key lookup and admin tasks,
 * never for reading or writing project data.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY.");
  return createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
