import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { fromPostgrest } from "./errors";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profile"]["Row"],
  "id" | "email" | "name" | "theme" | "open_task_after_create" | "created_at" | "updated_at"
>;

export function serializeProfile(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    theme: row.theme as (typeof THEMES)[number],
    open_task_after_create: row.open_task_after_create,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The caller's own profile. Preferences aren't readable from the table (co-members can read
 * each other's name and email only), so this goes through my_profile().
 */
export async function getMyProfile(db: Db) {
  const { data, error } = await db.rpc("my_profile").single();
  if (error) throw fromPostgrest(error);
  return serializeProfile(data);
}

/** The web app's colour themes; the database checks the same list. */
export const THEMES = ["lime", "sandpaper"] as const;
