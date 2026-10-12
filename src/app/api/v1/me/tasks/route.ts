import { json, parseWith, route } from "@/lib/api/handler";
import { taskListFilters } from "@/lib/api/schemas";
import { listTasks } from "@/lib/api/task-list";

/** Tasks assigned to the caller: the signed-in user, or the agent behind the API key. */
export const GET = route(async ({ db, actor, url }) => {
  const filters = parseWith(taskListFilters.omit({ assignee: true }), Object.fromEntries(url.searchParams));
  return json(await listTasks(db, actor, url, filters, { assignedTo: actor }));
});
