import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Supabase client for the browser, acting as the signed-in user from the session cookies.
 * Only for realtime signals: all reads and writes go through the API.
 */
export function browserClient() {
  client ??= createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  return client;
}
