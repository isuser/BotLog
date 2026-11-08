import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { fromPostgrest } from "./errors";

type WorkspaceRow = Database["public"]["Functions"]["my_workspace"]["Returns"][number];

export function serializeWorkspace(row: WorkspaceRow) {
  return {
    id: row.id,
    name: row.name,
    /** Unique across the instance; the full form of a project key is `handle/KEY`. */
    handle: row.handle,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The caller's own workspace. Selecting from the table also returns the workspaces owning
 * projects shared with the caller, so this goes through my_workspace().
 */
export async function getMyWorkspace(db: Db) {
  const { data, error } = await db.rpc("my_workspace").single();
  if (error) throw fromPostgrest(error);
  return serializeWorkspace(data);
}
