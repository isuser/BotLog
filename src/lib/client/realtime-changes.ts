import type { Cache } from "swr";

// Which SWR keys a burst of Realtime events should refetch (used by useRealtimeRefresh).

/** What the events since the last refresh are about. */
export type PendingChanges = {
  /** Something the cached tasks can't tell us is current: refetch every matching key. */
  all: boolean;
  /** Something besides the tasks themselves (comments, activity, epics…): refetch the other keys. */
  others: boolean;
  /** Tasks whose row changed, with the version the change made. */
  updated: Map<string, number>;
  /** Tasks that were created. */
  created: Set<string>;
};

export const noChanges = (): PendingChanges => ({ all: false, others: false, updated: new Map(), created: new Set() });

export type Row = Record<string, unknown>;

/** Adds one Realtime event (its new row) to `pending`. */
export function addChange(pending: PendingChanges, table: "activity_log" | "task", row: Row) {
  if (table === "task") {
    if (typeof row.id === "string" && typeof row.version === "number") {
      pending.updated.set(row.id, Math.max(row.version, pending.updated.get(row.id) ?? 0));
    } else {
      pending.all = true;
    }
  } else if (row.entity_type === "task" && typeof row.entity_id === "string") {
    // Every other task change (edit, move, labels, archive) also updates the task row, which
    // arrives as its own event; comments don't show in task lists.
    if (row.action === "created") pending.created.add(row.entity_id);
    else pending.others = true;
  } else {
    // Project, epic, label or column changes can show on every task (names, colours).
    pending.all = true;
  }
}

/** Whether cached data is a task or a list of tasks. */
export const holdsTasks = (data: unknown) => {
  const first: unknown = Array.isArray(data) ? data[0] : data;
  return typeof first === "object" && first !== null && "short_id" in first && "version" in first;
};

/** Every cached copy's version of a task, from single tasks and task lists alike. */
function cachedVersions(cache: Cache, id: string) {
  const versions: number[] = [];
  for (const key of cache.keys()) {
    const data: unknown = cache.get(key)?.data;
    for (const item of Array.isArray(data) ? data : [data]) {
      const task = item as Row | null;
      if (task?.id === id && typeof task.version === "number") versions.push(task.version);
    }
  }
  return versions;
}

/**
 * Which keys to refetch for `pending`. Changes this tab made itself are already in the cache
 * (its writes store the task the API returns), so they don't refetch the tasks again: only a
 * task the cache doesn't have at that version does.
 */
export function keysToRefetch(cache: Cache, pending: PendingChanges): "all" | "others" | "none" {
  const stale =
    pending.all ||
    [...pending.updated].some(([id, version]) => {
      const versions = cachedVersions(cache, id);
      return versions.length === 0 || versions.some((v) => v < version);
    }) ||
    [...pending.created].some((id) => cachedVersions(cache, id).length === 0);
  if (stale) return "all";
  return pending.others ? "others" : "none";
}
