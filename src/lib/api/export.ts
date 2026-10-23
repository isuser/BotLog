import type { Db } from "./auth";
import { fromPostgrest } from "./errors";

/** Rows per request; Supabase caps a response at 1000 rows by default. */
const PAGE = 1000;

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Parameters<typeof fromPostgrest>[0] | null }>;

/** Reads every row of a query, a page at a time. The query must have a stable order. */
async function readAll<T>(query: RangeQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw fromPostgrest(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * A whole project as plain data: the project, its board columns, epics, labels, tasks (with
 * label ids), comments and attachments (metadata only, not the image files), archived items included. Ids are kept, so references between them still resolve.
 */
export async function exportProject(db: Db, projectId: string) {
  const { data: project, error } = await db
    .from("project")
    .select("id, key, name, description, done_window_days, created_at, updated_at")
    .eq("id", projectId)
    .single();
  if (error) throw fromPostgrest(error);

  const [columns, epics, labels, tasks, comments, attachments] = await Promise.all([
    readAll((from, to) =>
      db
        .from("board_column")
        .select("id, kind, name, counts_as, position, hidden, created_at, updated_at")
        .eq("project_id", projectId)
        .order("position")
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from("epic")
        .select("id, title, description, status, target_date, archived_at, created_at, updated_at")
        .eq("project_id", projectId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      db.from("label").select("id, name, color, created_at, updated_at").eq("project_id", projectId).order("name").order("id").range(from, to),
    ),
    readAll((from, to) =>
      db
        .from("task")
        .select(
          "id, number, title, description, type, status, column_id, position, priority, epic_id, assignee_user_id, assignee_agent_id, due_date, version, done_at, archived_at, created_at, updated_at, task_labels:task_label(label_id)",
        )
        .eq("project_id", projectId)
        .order("number")
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from("comment")
        .select("id, task_id, author_user_id, author_agent_id, body, created_at, task:task!inner(project_id)")
        .eq("task.project_id", projectId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from("attachment")
        .select("id, task_id, uploader_user_id, uploader_agent_id, file_name, content_type, size, created_at")
        .eq("project_id", projectId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  return {
    format: "botlog-project-export",
    version: 1,
    exported_at: new Date().toISOString(),
    project,
    columns,
    epics,
    labels,
    tasks: tasks.map(({ task_labels, ...task }) => ({
      ...task,
      short_id: `${project.key}-${task.number}`,
      label_ids: (task_labels as { label_id: string }[]).map((tl) => tl.label_id),
    })),
    // The task embed was only there to filter by project.
    comments: comments.map((comment) => {
      const { task, ...rest } = comment;
      void task;
      return rest;
    }),
    attachments,
  };
}
