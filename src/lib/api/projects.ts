import type { Db } from "./auth";
import { fromPostgrest, notFound } from "./errors";
import { parseProjectRef } from "./ids";
import { TASK_STATUSES } from "./schemas";

/** Project columns plus a count of active tasks per status. */
export const PROJECT_SELECT =
  "id, key, name, description, created_at, updated_at, backlog:task(count), todo:task(count), in_progress:task(count), done:task(count)";

type CountEmbed = { count: number }[];

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
} & Record<(typeof TASK_STATUSES)[number], CountEmbed>;

/** Narrows each count embed to its status and to tasks that aren't archived. */
export function withTaskCounts<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q }>(
  query: Q,
): Q {
  let q = query;
  for (const status of TASK_STATUSES) {
    q = q.eq(`${status}.status`, status).is(`${status}.archived_at`, null);
  }
  return q;
}

export function serializeProject(row: ProjectRow) {
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, row[s]?.[0]?.count ?? 0])) as Record<
    (typeof TASK_STATUSES)[number],
    number
  >;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    task_counts: { ...counts, total: TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0) },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getProject(db: Db, ref: string) {
  const parsed = parseProjectRef(ref);
  let query = withTaskCounts(db.from("project").select(PROJECT_SELECT));
  query = "id" in parsed ? query.eq("id", parsed.id) : query.eq("key", parsed.key);
  const { data, error } = await query.maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Project");
  return serializeProject(data as unknown as ProjectRow);
}

/** The id of a project the caller can see, from a UUID or key. */
export async function resolveProjectId(db: Db, ref: string): Promise<string> {
  const parsed = parseProjectRef(ref);
  const query = db.from("project").select("id");
  const { data, error } = await ("id" in parsed ? query.eq("id", parsed.id) : query.eq("key", parsed.key)).maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Project");
  return data.id;
}
