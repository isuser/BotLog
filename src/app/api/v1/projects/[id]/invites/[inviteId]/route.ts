import { ApiError, fromPostgrest, notFound } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";
import { isUuid } from "@/lib/api/ids";
import { INVITE_SELECT, serializeInvite } from "@/lib/api/invites";
import { callerRole, canManage, forbidden } from "@/lib/api/members";
import { resolveProjectId } from "@/lib/api/projects";

type Params = { id: string; inviteId: string };

/** Revokes an open invite link, so it stops working. People only. */
export const DELETE = route<Params>(
  async ({ db, actor, params }) => {
    if (!isUuid(params.inviteId)) throw new ApiError("bad_request", `"${params.inviteId}" is not an invite ID.`);
    const projectId = await resolveProjectId(db, params.id);
    if (!canManage(await callerRole(db, projectId, actor.userId))) {
      throw forbidden("Only the project owner or an admin can manage invite links.");
    }

    const { data, error } = await db
      .from("project_invite")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", params.inviteId.toLowerCase())
      .eq("project_id", projectId)
      .is("used_at", null)
      .is("revoked_at", null)
      .select(INVITE_SELECT)
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    if (!data) throw notFound("Open invite");
    return json({ data: serializeInvite(data as never) });
  },
  { allowApiKey: false },
);
