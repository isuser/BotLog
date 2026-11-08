import { fromPostgrest, notFound } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { isInviteToken, serializeInvitePreview } from "@/lib/api/invites";
import { inviteTokenSchema } from "@/lib/api/schemas";

/**
 * What an invite link is for, for the join page: the project, who invited you and the role,
 * while it can still be used; otherwise only its `state`. The token comes in the body, never
 * the URL, so it stays out of request logs. People only.
 */
export const POST = route(
  async ({ db, request }) => {
    const { token } = await parseBody(request, inviteTokenSchema);
    if (!isInviteToken(token)) throw notFound("Invite");
    const { data, error } = await db.rpc("preview_project_invite", { token }).maybeSingle();
    if (error) throw fromPostgrest(error);
    if (!data) throw notFound("Invite");
    return json({ data: serializeInvitePreview(data) });
  },
  { allowApiKey: false },
);
