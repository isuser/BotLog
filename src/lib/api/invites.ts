import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["project_role"];

/** How long a new invite link works. The database caps it at 7 days. */
export const INVITE_EXPIRY = { "1h": 3600, "24h": 86_400, "7d": 7 * 86_400 } as const;
export type InviteExpiry = keyof typeof INVITE_EXPIRY;

// The 7-day option ends a minute early, so a clock that runs ahead of the database's can't
// push it past the cap.
const CLOCK_MARGIN_MS = 60_000;

export function inviteExpiresAt(expiresIn: InviteExpiry, now = Date.now()): string {
  const ms = INVITE_EXPIRY[expiresIn] * 1000;
  return new Date(now + (expiresIn === "7d" ? ms - CLOCK_MARGIN_MS : ms)).toISOString();
}

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A new invite token. Only `hash` is stored; the link with `token` is shown once. */
export function generateInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

/** The shape the database accepts (see private.invite_token_hash); anything else is no invite. */
export const isInviteToken = (value: string) => /^[A-Za-z0-9_-]{32,128}$/.test(value);

/**
 * The link to share. The token is in the fragment, which browsers never send to the server,
 * so it stays out of request logs and Referer headers.
 */
export const inviteUrl = (origin: string, token: string) => `${origin}/invite#${token}`;

// Never `token_hash`: it isn't readable by clients, and selecting it fails.
export const INVITE_SELECT =
  "id, project_id, role, expires_at, used_at, revoked_at, created_at, created_by_user:profile!project_invite_created_by_fkey(id, name, email)";

type InviteRow = {
  id: string;
  project_id: string;
  role: Role;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by_user: { id: string; name: string; email: string } | null;
};

export function serializeInvite(row: InviteRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    role: row.role,
    expires_at: row.expires_at,
    used_at: row.used_at,
    revoked_at: row.revoked_at,
    created_by: row.created_by_user,
    created_at: row.created_at,
  };
}

/** What the join page shows, from preview_project_invite. Details only while it can be used. */
type PreviewRow = Database["public"]["Functions"]["preview_project_invite"]["Returns"][number];

export function serializeInvitePreview(row: PreviewRow) {
  return {
    state: row.state as "valid" | "expired" | "used" | "revoked",
    is_member: row.is_member,
    project: row.project_id ? { id: row.project_id, key: row.project_key, name: row.project_name } : null,
    invited_by: row.inviter_name,
    role: row.role,
    expires_at: row.expires_at,
  };
}
