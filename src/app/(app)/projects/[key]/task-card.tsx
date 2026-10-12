"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BotIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

const TYPE_BADGE: Partial<Record<Task["type"], { label: string; variant: "danger" | "info" }>> = {
  bug: { label: "Bug", variant: "danger" },
  improvement: { label: "Improvement", variant: "info" },
};

const PRIORITY_BADGE: Partial<Record<Task["priority"], { label: string; variant: "danger" | "warning" | "secondary" }>> = {
  urgent: { label: "Urgent", variant: "danger" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "secondary" },
  low: { label: "Low", variant: "secondary" },
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function Assignee({ assignee }: { assignee: NonNullable<Task["assignee"]> }) {
  const name = assignee.name || ("email" in assignee ? assignee.email : "Agent");
  return (
    <span
      title={assignee.type === "agent" ? `${name} (agent)` : name}
      className={cn(
        "ml-auto flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        assignee.type === "agent" ? "bg-info text-info-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {assignee.type === "agent" ? <BotIcon className="size-3.5" /> : initials(name)}
      <span className="sr-only">Assigned to {name}</span>
    </span>
  );
}

export function TaskCard({ task, dragging = false }: { task: Task; dragging?: boolean }) {
  const type = TYPE_BADGE[task.type];
  const priority = PRIORITY_BADGE[task.priority];

  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm shadow-xs",
        dragging && "ring-ring/50 rotate-1 shadow-lg ring-2",
      )}
    >
      <span className="text-muted-foreground font-mono text-xs">{task.short_id}</span>
      <p className="line-clamp-3 leading-snug break-words">{task.title}</p>
      {(type || priority || task.assignee) && (
        <div className="flex items-center gap-1.5">
          {type && <Badge variant={type.variant}>{type.label}</Badge>}
          {priority && <Badge variant={priority.variant}>{priority.label}</Badge>}
          {task.assignee && <Assignee assignee={task.assignee} />}
        </div>
      )}
    </div>
  );
}

export function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation list-none outline-none", isDragging && "opacity-40")}
      aria-label={`${task.short_id}: ${task.title}`}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </li>
  );
}
