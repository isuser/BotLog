"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams, useRouter } from "next/navigation";
import { ActorAvatar, actorName } from "@/components/actor-avatar";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

export const TYPE_BADGE: Partial<Record<Task["type"], { label: string; variant: "danger" | "info" }>> = {
  bug: { label: "Bug", variant: "danger" },
  improvement: { label: "Improvement", variant: "info" },
};

export const PRIORITY_BADGE: Partial<
  Record<Task["priority"], { label: string; variant: "danger" | "warning" | "secondary" }>
> = {
  urgent: { label: "Urgent", variant: "danger" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "secondary" },
  low: { label: "Low", variant: "secondary" },
};

export const taskHref = (task: Pick<Task, "project_key" | "short_id">) =>
  `/projects/${task.project_key}/tasks/${task.short_id}`;

export function TaskCard({
  task,
  dragging = false,
  selected = false,
}: {
  task: Task;
  dragging?: boolean;
  selected?: boolean;
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
      <span className="text-muted-foreground font-mono text-xs">{task.short_id}</span>
      <p className="line-clamp-3 leading-snug break-words">{task.title}</p>
      {(type || priority || task.assignee) && (
        <div className="flex items-center gap-1.5">
          {type && <Badge variant={type.variant}>{type.label}</Badge>}
          {priority && <Badge variant={priority.variant}>{priority.label}</Badge>}
          {task.assignee && (
            <span className="ml-auto">
              <ActorAvatar actor={task.assignee} />
              <span className="sr-only">Assigned to {actorName(task.assignee)}</span>
            </span>
          )}
        </div>
      )}
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
      <TaskCard task={task} selected={taskId?.toUpperCase() === task.short_id} />
    </li>
  );
}
