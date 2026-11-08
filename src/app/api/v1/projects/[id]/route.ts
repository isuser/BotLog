import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { getProject, resolveProjectId } from "@/lib/api/projects";
import { updateProjectSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params, actor }) => {
  return json({ data: await getProject(db, params.id, actor.userId) });
});

export const PATCH = route<Params>(async ({ db, request, params, actor }) => {
  const raw = await request.clone().json().catch(() => null);
  if (raw && typeof raw === "object" && "key" in raw) {
    throw new ApiError("bad_request", "A project's key can't be changed, so its short IDs stay stable.");
  }
  const body = await parseBody(request, updateProjectSchema);
  const id = await resolveProjectId(db, params.id);
  const { data, error } = await db.from("project").update(body).eq("id", id).select("id");
  if (error) throw fromPostgrest(error);
  // The caller can see the project (resolveProjectId found it) but RLS let nothing through:
  // they're a member, and only the owner and admins change projects.
  if (!data.length) throw new ApiError("forbidden", "Only the project owner or an admin can change this project.");
  return json({ data: await getProject(db, id, actor.userId) });
});
