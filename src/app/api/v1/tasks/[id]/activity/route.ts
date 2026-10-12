import { ACTIVITY_SELECT, serializeActivity } from "@/lib/api/activity";
import { fromPostgrest } from "@/lib/api/errors";
import { json, route } from "@/lib/api/handler";
import { decodeCursor, page, parseLimit } from "@/lib/api/pagination";
import { getTaskRow } from "@/lib/api/tasks";

type Params = { id: string };
type ActivityRow = Parameters<typeof serializeActivity>[0];

/** A task's history, newest first. */
export const GET = route<Params>(async ({ db, url, params }) => {
  const limit = parseLimit(url.searchParams);
  const cursor = decodeCursor(url.searchParams, 1);
  const task = await getTaskRow(db, params.id);

  let query = db.from("activity_log").select(ACTIVITY_SELECT).eq("entity_type", "task").eq("entity_id", task.id);
  if (cursor) query = query.lt("seq", Number(cursor[0]));
  const { data, error } = await query.order("seq", { ascending: false }).limit(limit + 1);
  if (error) throw fromPostgrest(error);

  const result = page(data as unknown as ActivityRow[], limit, (row) => [row.seq]);
  return json({ data: result.data.map(serializeActivity), next_cursor: result.next_cursor });
});
