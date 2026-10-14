"use client";

import useSWR from "swr";
import { TaskGroups } from "@/components/task-groups";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAll } from "@/lib/client/api";
import { useRealtimeRefresh } from "@/lib/client/realtime";
import { sortByUrgency } from "@/lib/client/task-sort";
import type { Task } from "@/lib/client/types";

/**
 * Everything assigned to you, across projects, by status. Within a status: most urgent first,
 * then the soonest due. Done starts folded. Kept live across the whole workspace.
 */
export function MyTasksView() {
  const { data: tasks, error } = useSWR("/me/tasks", (path: string) => apiAll<Task>(path));
  // No project filter: Realtime applies your RLS, so this hears about your whole workspace.
  useRealtimeRefresh("workspace:my-tasks", (key) => key.startsWith("/me/tasks"));

  const ordered = tasks && sortByUrgency(tasks);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8 [&>*]:shrink-0">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">My tasks</h1>
        <p className="text-muted-foreground text-sm">Assigned to you across all projects.</p>
      </div>
      {error ? (
        <p className="text-danger">Couldn&apos;t load your tasks: {error.message}</p>
      ) : !ordered ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center text-sm">
          <p className="text-foreground font-medium">Nothing assigned to you</p>
          <p>Tasks you&apos;re assigned to in any project show up here.</p>
        </div>
      ) : (
        <TaskGroups tasks={ordered} showDetails collapseDone />
      )}
    </main>
  );
}
