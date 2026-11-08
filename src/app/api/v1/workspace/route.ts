import { fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { updateWorkspaceSchema } from "@/lib/api/schemas";
import { getMyWorkspace, serializeWorkspace } from "@/lib/api/workspace";

/** The caller's own workspace: its name and handle. */
export const GET = route(async ({ db }) => {
  return json({ data: await getMyWorkspace(db) });
});

/**
 * Changes the workspace handle. People only: agents can't manage the workspace. Old
 * `handle/KEY-42` references stop working, and the old handle is free for anyone to take.
 */
export const PATCH = route(
  async ({ db, request }) => {
    const body = await parseBody(request, updateWorkspaceSchema);
    const workspace = await getMyWorkspace(db);
    if (workspace.handle === body.handle) return json({ data: workspace });
    const { data, error } = await db
      .from("workspace")
      .update({ handle: body.handle })
      .eq("id", workspace.id)
      .select("id, name, handle, created_at, updated_at")
      .single();
    if (error) throw fromPostgrest(error);
    return json({ data: serializeWorkspace(data) });
  },
  { allowApiKey: false },
);
