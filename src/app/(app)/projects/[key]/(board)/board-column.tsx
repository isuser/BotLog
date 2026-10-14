"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_COLORS } from "@/lib/client/task-labels";
import type { Task, TaskStatus } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { QuickAdd } from "./quick-add";
import { SortableTaskCard } from "./task-card";

export function BoardColumn({
  status,
  title,
  tasks,
  onAdd,
}: {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onAdd: (status: TaskStatus, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      aria-label={title}
      className={cn(
        "bg-muted flex w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 rounded-xl border border-t-4 p-3 sm:w-72",
        STATUS_COLORS[status].edge,
      )}
    >
      <header className="flex items-center justify-between px-1">
        <h2
          className={cn(
            "font-display text-[13px] leading-4 font-bold tracking-[0.06em] uppercase",
            STATUS_COLORS[status].title,
          )}
        >
          {title}
        </h2>
        <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
          {tasks.length}
        </span>
      </header>

      <QuickAdd columnTitle={title} onAdd={(t) => onAdd(status, t)} />

      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-lg transition-colors",
            status === "done" && "[&>li]:opacity-70",
            isOver && tasks.length === 0 && "bg-accent/50",
          )}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}
