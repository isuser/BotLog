"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_COLORS } from "@/lib/client/task-labels";
import type { BoardColumn as Column, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { QuickAdd } from "./quick-add";
import { SortableTaskCard } from "./task-card";

export function BoardColumn({
  column,
  tasks,
  onAdd,
  focusOnShortcut,
  footer,
}: {
  column: Pick<Column, "id" | "name" | "counts_as" | "hidden">;
  tasks: Task[];
  onAdd: (columnId: string, title: string) => Promise<void>;
  focusOnShortcut: boolean;
  footer?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  // Custom columns take the colour of the status they count as.
  const status = column.counts_as;
  const title = column.name;

  return (
    <section
      aria-label={title}
      className={cn(
        "bg-muted flex min-h-0 w-[85vw] max-w-80 shrink-0 snap-start flex-col gap-3 rounded-xl border border-t-4 p-3 sm:w-72",
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
          {column.hidden && <span className="text-muted-foreground ml-2 font-sans text-xs font-normal normal-case tracking-normal">(hidden)</span>}
        </h2>
        <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
          {tasks.length}
        </span>
      </header>

      {!column.hidden && <QuickAdd columnTitle={title} onAdd={(t) => onAdd(column.id, t)} focusOnShortcut={focusOnShortcut} />}

      <SortableContext id={column.id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            // Every column is as tall as the board; long ones scroll on their own.
            "-mx-1 flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg px-1 transition-colors",
            status === "done" && "[&>li]:opacity-70",
            isOver && tasks.length === 0 && "bg-accent/50",
          )}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
        </ul>
      </SortableContext>
      {footer}
    </section>
  );
}
