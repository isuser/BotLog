"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ActorAvatar, actorName, UnassignedAvatar } from "@/components/actor-avatar";
import { EpicPill } from "@/components/epic-pill";
import { LabelChip } from "@/components/label-chip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { taskHref } from "@/lib/client/board";
import { formatDate, fullDate, timeAgo } from "@/lib/client/format";
import { PRIORITY_BADGE, STATUS_COLORS, STATUS_LABELS, TYPE_BADGE } from "@/lib/client/task-labels";
import { DEFAULT_SORT, nextSort, parseSort, sortTasks, type Sort, type SortKey } from "@/lib/client/task-sort";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { QuickAdd } from "../(board)/quick-add";

/** Remembers the viewer's sort in this browser; a per-viewer convenience, not shared. */
const SORT_STORAGE_KEY = "botlog-list-sort";

const COLUMNS_SPEC: { key: SortKey; label: string; className?: string }[] = [
  { key: "number", label: "ID", className: "w-20" },
  { key: "title", label: "Title", className: "min-w-64" },
  { key: "status", label: "Status", className: "w-32" },
  { key: "priority", label: "Priority", className: "w-24" },
  { key: "type", label: "Type", className: "w-28" },
  { key: "assignee", label: "Assignee", className: "w-40" },
  { key: "epic", label: "Epic", className: "w-40" },
  { key: "due_date", label: "Due", className: "w-28" },
  { key: "updated_at", label: "Updated", className: "w-28" },
];

/** The project's active tasks as a sortable table. Opening a row shows the task over the list. */
export function TaskList({ projectKey }: { projectKey: string }) {
  // The board's key: shared cache, realtime refreshes, and edits from the panel stay in sync.
  const tasksKey = `/projects/${projectKey}/tasks`;
  const { data: tasks, error, mutate } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));
  const { taskId } = useParams<{ taskId?: string }>();
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      // Restoring a saved choice from browser storage after mount, so the server render matches.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSort(parseSort(JSON.parse(saved)));
    } catch {
      // No storage (private mode) or a bad value: keep board order.
    }
  }, []);

  function changeSort(key: SortKey) {
    const next = nextSort(sort, key);
    setSort(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The sort still applies; it just isn't remembered.
    }
  }

  async function addTask(title: string) {
    try {
      const { data } = await api<{ data: Task }>(tasksKey, { method: "POST", json: { title } });
      await mutate((current) => [data, ...(current ?? [])], { revalidate: false });
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-medium">Couldn&apos;t load tasks</p>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </main>
    );
  }
  if (!tasks) return <TaskListSkeleton />;

  const rows = sortTasks(tasks, sort);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[77rem] flex-1 flex-col gap-3 px-4 pb-4">
      <div className="max-w-md">
        <QuickAdd columnTitle="the backlog" onAdd={addTask} />
      </div>
      {tasks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center text-sm">
          <p className="text-foreground font-medium">No tasks yet</p>
          <p>Add one above, or from the board.</p>
        </div>
      ) : (
        <div className="bg-card min-h-0 flex-1 overflow-auto rounded-xl border">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr className="border-b">
                {COLUMNS_SPEC.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn("p-0 text-left font-medium", column.className)}
                    >
                      <button
                        type="button"
                        onClick={() => changeSort(column.key)}
                        className={cn(
                          "hover:text-foreground flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold tracking-[0.04em] uppercase",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {column.label}
                        {active &&
                          (sort.dir === "asc" ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={taskId?.toUpperCase() === task.short_id}
                  overdue={Boolean(task.due_date && task.status !== "done" && task.due_date < today)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** One row. The title is the link; the rest of the row is clickable through it (stretched). */
function TaskRow({ task, selected, overdue }: { task: Task; selected: boolean; overdue: boolean }) {
  const type = TYPE_BADGE[task.type];
  const priority = PRIORITY_BADGE[task.priority];
  return (
    <tr className={cn("hover:bg-accent/50 relative", selected && "bg-accent/60", task.status === "done" && "text-muted-foreground")}>
      <td className="text-muted-foreground px-3 py-2 font-mono text-xs whitespace-nowrap">{task.short_id}</td>
      <td className="px-3 py-2">
        <Link
          href={taskHref(task, "list")}
          scroll={false}
          className="block min-w-0 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
        >
          <span className="line-clamp-2 break-words">{task.title}</span>
        </Link>
        {task.labels.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {task.labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
          </span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", STATUS_COLORS[task.status].dot)} />
          {STATUS_LABELS[task.status]}
        </span>
      </td>
      <td className="px-3 py-2">{priority ? <Badge variant={priority.variant}>{priority.label}</Badge> : <Dash />}</td>
      <td className="px-3 py-2">{type ? <Badge variant={type.variant}>{type.label}</Badge> : <span className="text-muted-foreground">Feature</span>}</td>
      <td className="px-3 py-2">
        {task.assignee ? (
          <span className="flex min-w-0 items-center gap-2">
            <ActorAvatar actor={task.assignee} className="size-5" />
            <span className="truncate">{actorName(task.assignee)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-2">
            <UnassignedAvatar className="size-5 [&_svg]:size-3" />
            Unassigned
          </span>
        )}
      </td>
      <td className="max-w-40 px-3 py-2">{task.epic ? <EpicPill epic={task.epic} /> : <Dash />}</td>
      <td className={cn("px-3 py-2 whitespace-nowrap", overdue && "text-danger font-medium")}>
        {task.due_date ? formatDate(task.due_date) : <Dash />}
      </td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        <time dateTime={task.updated_at} title={fullDate(task.updated_at)}>
          {timeAgo(task.updated_at)}
        </time>
      </td>
    </tr>
  );
}

const Dash = () => <span className="text-muted-foreground">—</span>;

export function TaskListSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[77rem] flex-col gap-3 px-4">
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
