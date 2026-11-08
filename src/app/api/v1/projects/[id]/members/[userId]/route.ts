import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { callerRole, canManage, forbidden, getMemberRow, MEMBER_SELECT, serializeMember } from "@/lib/api/members";
import { resolveProjectId } from "@/lib/api/projects";
import { updateMemberSchema } from "@/lib/api/schemas";

type Params = { id: string; userId: string };

/** Switches a member between admin and member. Owner or admin, people only. */
export const PATCH = route<Params>(
  async ({ db, actor, params, request }) => {
    const body = await parseBody(request, updateMemberSchema);
    const projectId = await resolveProjectId(db, params.id);
    if (!canManage(await callerRole(db, projectId, actor.userId))) {
      throw forbidden("Only the project owner or an admin can change roles.");
    }
    const member = await getMemberRow(db, projectId, params.userId, actor.userId);
    if (member.role === "owner") throw forbidden("The project owner's role can't be changed.");

    const { data, error } = await db
      .from("project_member")
      .update({ role: body.role })
      .eq("project_id", projectId)
      .eq("user_id", member.user.id)
      .select(MEMBER_SELECT)
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    // Their role or the caller's changed since the checks above, and RLS let nothing through.
    if (!data) throw forbidden("Only the project owner or an admin can change roles.");
    return json({ data: serializeMember(data as never) });
  },
  { allowApiKey: false },
);

/**
 * Removes someone from the project (owner or admin), or leaves it (`me`), and answers with
 * the membership that ended. Their tasks and
 * their agents' tasks in the project become unassigned. The owner can't be removed or leave.
 */
export const DELETE = route<Params>(
  async ({ db, actor, params }) => {
    const projectId = await resolveProjectId(db, params.id);
    const member = await getMemberRow(db, projectId, params.userId, actor.userId);
    const leaving = member.user.id === actor.userId;
    if (member.role === "owner") {
      throw leaving
        ? new ApiError("bad_request", "The project owner can't leave their project.")
        : forbidden("The project owner can't be removed.");
    }
    if (!leaving && !canManage(await callerRole(db, projectId, actor.userId))) {
      throw forbidden("Only the project owner or an admin can remove people.");
    }

    const { data, error } = await db
      .from("project_member")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", member.user.id)
      .select("user_id");
    if (error) throw fromPostgrest(error);
    if (!data.length) throw forbidden("You can't remove this person.");
    return json({ data: serializeMember(member) });
  },
  { allowApiKey: false },
);
