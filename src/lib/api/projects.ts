import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ambiguous, fromPostgrest, notFound } from "./errors";
import { fullForm, parseProjectRef, type ProjectRef } from "./ids";
import { TASK_STATUSES } from "./schemas";

/** Project columns, a count of active tasks per status, and the caller's membership. */
export const PROJECT_SELECT =
  "id, key, name, description, done_window_days, created_at, updated_at, backlog:task(count), todo:task(count), in_progress:task(count), done:task(count), membership:project_member(role)";

type CountEmbed = { count: number }[];

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  done_window_days: number;
  created_at: string;
  updated_at: string;
  membership: { role: Database["public"]["Enums"]["project_role"] }[];
} & Record<(typeof TASK_STATUSES)[number], CountEmbed>;

type Narrowable<Q> = { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q };

/** Narrows each count embed to its status and to tasks that aren't archived. */
export function withTaskCounts<Q extends Narrowable<Q>>(query: Q): Q {
  let q = query;
  for (const status of TASK_STATUSES) {
    q = q.eq(`${status}.status`, status).is(`${status}.archived_at`, null);
  }
  return q;
}

/**
 * Narrows PROJECT_SELECT's embeds: task counts, and the membership to the caller's own row
 * (members can see each other's).
 */
export const narrowProjects = <Q extends Narrowable<Q>>(query: Q, userId: string): Q =>
  withTaskCounts(query).eq("membership.user_id", userId);

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
    done_window_days: row.done_window_days,
    /** The caller's role: owner, admin or member. */
    role: row.membership?.[0]?.role ?? null,
    task_counts: { ...counts, total: TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0) },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * The one project a reference points to, from the projects the caller can see. A bare key can
 * match several (people sharing projects can use the same key): then it's an `ambiguous` error
 * listing the full forms, never a guess.
 */
async function findProject<T extends { key: string; workspace: { handle: string } }>(
  db: Db,
  ref: string,
  select: string,
  narrow: <Q extends Narrowable<Q>>(query: Q) => Q = (q) => q,
): Promise<T> {
  const parsed: ProjectRef = parseProjectRef(ref);
  let query = narrow(db.from("project").select(`${select}, workspace:workspace!inner(handle)`));
  if ("id" in parsed) query = query.eq("id", parsed.id);
  else {
    query = query.eq("key", parsed.key);
    if (parsed.handle) query = query.eq("workspace.handle", parsed.handle);
  }
  const { data, error } = await query.limit(10);
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as unknown as T[];
  if (rows.length === 0) throw notFound("Project");
  if (rows.length > 1) throw ambiguous(decodeURIComponent(ref).trim(), rows.map((r) => fullForm(r.workspace.handle, r.key)));
  return rows[0];
}

export async function getProject(db: Db, ref: string, userId: string) {
  return serializeProject(
    await findProject<ProjectRow & { workspace: { handle: string } }>(db, ref, PROJECT_SELECT, (q) => narrowProjects(q, userId)),
  );
}

/** The id of a project the caller can see, from a UUID, key or handle/key. */
export async function resolveProjectId(db: Db, ref: string): Promise<string> {
  return (await findProject<{ id: string; key: string; workspace: { handle: string } }>(db, ref, "id, key")).id;
}
