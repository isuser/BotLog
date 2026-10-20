import type { Db } from "@/lib/api/auth";
import {
  activeTaskCount,
  type Column,
  COLUMN_SELECT,
  columnPosition,
  getColumnRow,
  projectColumns,
  serializeColumn,
} from "@/lib/api/columns";
import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, parseWith, route } from "@/lib/api/handler";
import { deleteColumnQuery, updateColumnSchema } from "@/lib/api/schemas";

type Params = { id: string };

export const GET = route<Params>(async ({ db, params }) => {
  return json({ data: await getColumnRow(db, params.id) });
});

/**
 * Renames, reorders (after_id / before_id), hides or shows a column. Moving a custom column
 * across In progress (or In progress across custom columns) changes what they count as, and
 * their tasks' status follows. Built-ins keep their name; Backlog and Done stay first and
 * last; only an empty To do or In progress can be hidden.
 */
export const PATCH = route<Params>(
  async ({ db, request, params }) => {
    const { after_id, before_id, ...fields } = await parseBody(request, updateColumnSchema);
    const column = await getColumnRow(db, params.id);
    const position =
      after_id || before_id
        ? columnPosition(await projectColumns(db, column.project_id), {
            afterId: after_id,
            beforeId: before_id,
            excludeId: column.id,
          })
        : undefined;

    const { data, error } = await activeTaskCount(
      db
        .from("board_column")
        .update({ ...fields, ...(position ? { position } : {}) })
        .eq("id", column.id)
        .select(COLUMN_SELECT),
    ).maybeSingle();
    if (error) throw fromPostgrest(error);
    if (!data) throw new ApiError("forbidden", "You don't have access to do this.");
    return json({ data: serializeColumn(data) });
  },
  { allowApiKey: false },
);

/**
 * Deletes a custom column. Its tasks (archived ones too) move to `move_to`, a visible column
 * of the project; by default the first visible one counting as the same status.
 */
export const DELETE = route<Params>(
  async ({ db, url, params }) => {
    const query = parseWith(deleteColumnQuery, Object.fromEntries(url.searchParams));
    const column = await getColumnRow(db, params.id);
    if (column.kind !== "custom") {
      throw new ApiError("bad_request", "Built-in columns can't be deleted. To do and In progress can be hidden.");
    }
    const moveTo = query.move_to ?? (await defaultMoveTo(db, column));
    const { error } = await db.rpc("delete_board_column", { p_column_id: column.id, p_move_to: moveTo });
    if (error) throw fromPostgrest(error);
    return json({ data: column });
  },
  { allowApiKey: false },
);

/**
 * Where a deleted column's tasks go by default: the built-in column for its status, or the
 * first other visible column counting as that status when the built-in is hidden.
 */
async function defaultMoveTo(db: Db, column: Column) {
  const candidates = (await projectColumns(db, column.project_id)).filter(
    (c) => c.id !== column.id && c.counts_as === column.counts_as && !c.hidden,
  );
  const target = candidates.find((c) => c.kind !== "custom") ?? candidates[0];
  if (!target) {
    throw new ApiError("bad_request", "No visible column takes these tasks. Send move_to with the column they should go to.");
  }
  return target.id;
}
