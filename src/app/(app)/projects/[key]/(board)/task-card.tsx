"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { ActorAvatar, actorName, UnassignedAvatar } from "@/components/actor-avatar";
import { EpicPill } from "@/components/epic-pill";
import { LabelChip } from "@/components/label-chip";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client/api";
import { taskHref, type TaskView } from "@/lib/client/board";
import { PRIORITY_BADGE, TYPE_BADGE } from "@/lib/client/task-labels";
import type { Profile, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { AssigneePicker } from "./assignee-picker";

export function TaskCard({
  task,
  dragging = false,
  selected = false,
  assignee,
}: {
  task: Task;
  dragging?: boolean;
  selected?: boolean;
  /** Replaces the static avatar, e.g. with a picker on interactive cards. */
  assignee?: React.ReactNode;
}) {
  const type = TYPE_BADGE[task.type];
  const priority = PRIORITY_BADGE[task.priority];

  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm shadow-xs",
        !dragging && "hover:border-ring/50 cursor-pointer transition-colors",
        selected && "border-ring/70",
        dragging && "ring-ring/50 rotate-1 shadow-lg ring-2",
      )}
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="font-mono">{task.short_id}</span>
        {task.epic && <EpicPill epic={task.epic} className="max-w-[60%]" />}
      </span>
      <p className="line-clamp-3 leading-snug break-words">{task.title}</p>
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}
      {/* Every card has this row, so the assignee (or the empty seat) is always in the same place. */}
      <div className="flex items-center gap-1.5">
        {type && <Badge variant={type.variant}>{type.label}</Badge>}
        {priority && <Badge variant={priority.variant}>{priority.label}</Badge>}
        <span className="ml-auto flex">
          {assignee ?? (
            <>
              {task.assignee ? <ActorAvatar actor={task.assignee} /> : <UnassignedAvatar />}
              <span className="sr-only">{task.assignee ? `Assigned to ${actorName(task.assignee)}` : "Unassigned"}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** A draggable card. Click, tap or Enter opens the task; Space picks it up. */
export function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const router = useRouter();
  const { taskId } = useParams<{ taskId?: string }>();
  const href = taskHref(task);

  function open(newTab: boolean) {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href, { scroll: false });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // relative: keeps the sr-only assignee label inside the board scroller on phones.
        "relative touch-manipulation list-none rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isDragging && "opacity-40",
      )}
      aria-label={`${task.short_id}: ${task.title}`}
      {...attributes}
      {...listeners}
      onClick={(e) => open(e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isDragging) {
          e.preventDefault();
          open(e.metaKey || e.ctrlKey);
        } else {
          listeners?.onKeyDown?.(e);
        }
      }}
    >
      <TaskCard
        task={task}
        selected={taskId?.toUpperCase() === task.short_id}
        assignee={<AssigneePicker task={task} />}
      />
    </li>
  );
}

/**
 * Fetches the task route's shell (the same for every task) as soon as the view has a task,
 * so opening a task never waits for the server.
 */
export function usePrefetchTaskRoute(tasks: Task[] | undefined, view: TaskView) {
  const router = useRouter();
  const href = tasks?.[0] && taskHref(tasks[0], view);
  useEffect(() => {
    if (href) router.prefetch(href);
  }, [href, router]);
}

/**
 * Opens a task you just added, unless you turned that off in Settings. Call it once the task is
 * in the cache, so the panel shows it straight away.
 */
export function useOpenNewTask(view: TaskView) {
  const router = useRouter();
  const { data: me } = useSWR("/me", (path: string) => api<{ data: Profile }>(path).then((r) => r.data));
  // On by default, like the profile column, so it works before /me has loaded.
  const enabled = me?.open_task_after_create ?? true;
  return (task: Task) => {
    if (enabled) router.push(taskHref(task, view), { scroll: false });
  };
}
