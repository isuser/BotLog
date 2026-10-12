"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
      className="bg-muted/40 flex w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 rounded-xl border p-3 sm:w-72"
    >
      <header className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">{tasks.length}</span>
      </header>

      <QuickAdd columnTitle={title} onAdd={(t) => onAdd(status, t)} />

      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-lg transition-colors",
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
