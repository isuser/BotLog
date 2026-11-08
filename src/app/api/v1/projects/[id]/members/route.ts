import { fromPostgrest } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";
import { byRole, MEMBER_SELECT, serializeMember, type MemberRow } from "@/lib/api/members";
import { resolveProjectId } from "@/lib/api/projects";

type Params = { id: string };

/** Everyone in the project with their role: owner first, then admins, then members. */
export const GET = route<Params>(async ({ db, params }) => {
  const projectId = await resolveProjectId(db, params.id);
  const { data, error } = await db.from("project_member").select(MEMBER_SELECT).eq("project_id", projectId);
  if (error) throw fromPostgrest(error);
  const rows = (data as unknown as MemberRow[]).sort(byRole);
  return json({ data: rows.map(serializeMember), next_cursor: null });
});
