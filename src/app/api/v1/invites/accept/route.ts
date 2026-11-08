import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { isInviteToken } from "@/lib/api/invites";
import { getProject } from "@/lib/api/projects";
import { inviteTokenSchema } from "@/lib/api/schemas";

/**
 * Joins the invite's project with its role and uses the link up. Answers with the project.
 * The token comes in the body, never the URL. People only: agents follow their owner in.
 */
export const POST = route(
  async ({ db, actor, request }) => {
    const { token } = await parseBody(request, inviteTokenSchema);
    if (!isInviteToken(token)) throw new ApiError("not_found", "This invite link doesn't exist.");
    const { data: projectId, error } = await db.rpc("accept_project_invite", { token });
    if (error) throw fromPostgrest(error);
    return json({ data: await getProject(db, projectId, actor.userId) });
  },
  { allowApiKey: false },
);
