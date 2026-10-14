import { json, parseWith, route } from "@/lib/api/handler";
import { taskListFilters } from "@/lib/api/schemas";
import { listTasks } from "@/lib/api/task-list";

/**
 * Tasks across every project in the workspace, with the same filters as a project's list.
 * Mostly for search: `?q=` matches a short ID (BOT-42) or words in the title.
 */
export const GET = route(async ({ db, actor, url }) => {
  const filters = parseWith(taskListFilters, Object.fromEntries(url.searchParams));
  return json(await listTasks(db, actor, url, filters, {}));
});
