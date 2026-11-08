import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import {
  generateInviteToken,
  INVITE_SELECT,
  inviteExpiresAt,
  inviteUrl,
  serializeInvite,
} from "@/lib/api/invites";
import { callerRole, canManage, forbidden } from "@/lib/api/members";
import { resolveProjectId } from "@/lib/api/projects";
import { createInviteSchema } from "@/lib/api/schemas";

type Params = { id: string };

const notAllowed = () => forbidden("Only the project owner or an admin can manage invite links.");

/** The project's open invite links (not used, revoked or expired), newest first. People only. */
export const GET = route<Params>(
  async ({ db, actor, params }) => {
    const projectId = await resolveProjectId(db, params.id);
    if (!canManage(await callerRole(db, projectId, actor.userId))) throw notAllowed();

    const { data, error } = await db
      .from("project_invite")
      .select(INVITE_SELECT)
      .eq("project_id", projectId)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw fromPostgrest(error);
    return json({ data: data.map(serializeInvite), next_cursor: null });
  },
  { allowApiKey: false },
);

/**
 * A new single-use invite link. `url` and `token` are in this response only; the token isn't
 * stored, just its hash. `url` uses this request's address; the web app builds the link from
 * its own (`/invite#<token>`). People only.
 */
export const POST = route<Params>(
  async ({ db, actor, params, request, url }) => {
    const body = await parseBody(request, createInviteSchema);
    const projectId = await resolveProjectId(db, params.id);
    if (!canManage(await callerRole(db, projectId, actor.userId))) throw notAllowed();

    const { token, hash } = generateInviteToken();
    const { data, error } = await db
      .from("project_invite")
      .insert({ project_id: projectId, token_hash: hash, role: body.role, expires_at: inviteExpiresAt(body.expires_in) })
      .select(INVITE_SELECT)
      .single();
    if (error) throw fromPostgrest(error);
    return json({ data: { ...serializeInvite(data as never), token, url: inviteUrl(url.origin, token) } }, 201);
  },
  { allowApiKey: false },
);
