import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

type Role = Database["public"]["Enums"]["project_role"];

export const MEMBER_SELECT = "project_id, role, created_at, user:profile!project_member_user_id_fkey(id, name, email)";

export type MemberRow = {
  project_id: string;
  role: Role;
  created_at: string;
  user: { id: string; name: string; email: string };
};

export function serializeMember(row: MemberRow) {
  return { ...row.user, role: row.role, joined_at: row.created_at };
}

/** Owners first, then admins, then members; oldest first within each. */
const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
export const byRole = (a: MemberRow, b: MemberRow) =>
  ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.created_at.localeCompare(b.created_at);

/** A member of the project, by user id or `me`. */
export async function getMemberRow(db: Db, projectId: string, ref: string, callerId: string): Promise<MemberRow> {
  const userId = ref === "me" ? callerId : ref;
  if (!isUuid(userId)) throw new ApiError("bad_request", `"${ref}" is not a user ID. Use a UUID or "me".`);
  const { data, error } = await db
    .from("project_member")
    .select(MEMBER_SELECT)
    .eq("project_id", projectId)
    .eq("user_id", userId.toLowerCase())
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Member");
  return data as unknown as MemberRow;
}

/** The caller's role in a project they can see. */
export async function callerRole(db: Db, projectId: string, callerId: string): Promise<Role> {
  return (await getMemberRow(db, projectId, "me", callerId)).role;
}

export const canManage = (role: Role) => role === "owner" || role === "admin";

export const forbidden = (message: string) => new ApiError("forbidden", message);
