import type { Database } from "@/lib/supabase/database.types";

export const PROFILE_SELECT = "id, email, name, theme, created_at, updated_at";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profile"]["Row"],
  "id" | "email" | "name" | "theme" | "created_at" | "updated_at"
>;

export function serializeProfile(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    theme: row.theme as (typeof THEMES)[number],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** The web app's colour themes; the database checks the same list. */
export const THEMES = ["lime", "sandpaper"] as const;
