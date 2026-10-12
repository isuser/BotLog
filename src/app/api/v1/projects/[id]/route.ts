import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { getProject, resolveProjectId } from "@/lib/api/projects";
import { updateProjectSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: await getProject(db, params.id) });
});

export const PATCH = route<Params>(async ({ db, request, params }) => {
  const raw = await request.clone().json().catch(() => null);
  if (raw && typeof raw === "object" && "key" in raw) {
    throw new ApiError("bad_request", "A project's key can't be changed, so its short IDs stay stable.");
  }
  const body = await parseBody(request, updateProjectSchema);
  const id = await resolveProjectId(db, params.id);
  const { error } = await db.from("project").update(body).eq("id", id);
  if (error) throw fromPostgrest(error);
  return json({ data: await getProject(db, id) });
});
