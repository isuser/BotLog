"use client";

import { ChevronRightIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActorAvatar, actorName, UnassignedAvatar } from "@/components/actor-avatar";
import { EpicPill } from "@/components/epic-pill";
import { LabelChip } from "@/components/label-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COLUMNS, groupByStatus, taskHref } from "@/lib/client/board";
import { formatDate } from "@/lib/client/format";
import { PRIORITY_BADGE, STATUS_COLORS, TYPE_BADGE } from "@/lib/client/task-labels";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/**
 * Tasks grouped under their status (empty groups hidden), each row linking to the task on its
 * board. Used by the epic page and My tasks.
 */
export function TaskGroups({
  tasks,
  showDetails = false,
  collapseDone = false,
  onRemove,
  removeLabel = "Remove",
}: {
  tasks: Task[];
  /** Show each task's epic and due date, for lists that span epics or projects. */
  showDetails?: boolean;
  /** Start the Done group folded, with its count, for long-running lists. */
  collapseDone?: boolean;
  /** Adds an × to each row. */
  onRemove?: (task: Task) => void;
  removeLabel?: string;
}) {
  const columns = groupByStatus(tasks);
  const [doneOpen, setDoneOpen] = useState(!collapseDone);

  return (
    <div className="flex flex-col gap-4">
      {COLUMNS.filter(({ status }) => columns[status].length > 0).map(({ status, title }) => {
        const folded = status === "done" && !doneOpen;
        const heading = (
          <>
            <span className={cn("size-2 rounded-full", STATUS_COLORS[status].dot)} />
            {title}
            <span className="text-muted-foreground font-normal tabular-nums">{columns[status].length}</span>
          </>
        );
        return (
          <div key={status} className="flex flex-col gap-1.5">
            <h3 className={cn("flex items-center gap-2 text-xs font-semibold tracking-[0.06em] uppercase", STATUS_COLORS[status].title)}>
              {status === "done" && collapseDone ? (
                <button
                  type="button"
                  aria-expanded={doneOpen}
                  onClick={() => setDoneOpen((open) => !open)}
                  className="flex items-center gap-2 uppercase"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", doneOpen && "rotate-90")} />
                  {heading}
                </button>
              ) : (
                heading
              )}
            </h3>
            {!folded && (
              <ul className="bg-card divide-y rounded-lg border">
                {columns[status].map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    showDetails={showDetails}
                    onRemove={onRemove}
                    removeLabel={removeLabel}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  showDetails,
  onRemove,
  removeLabel,
}: {
  task: Task;
  showDetails: boolean;
  onRemove?: (task: Task) => void;
  removeLabel: string;
}) {
  const type = TYPE_BADGE[task.type];
  const priority = PRIORITY_BADGE[task.priority];
  const overdue = task.due_date && task.status !== "done" && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <li className="group flex items-center">
      <Link
        href={taskHref(task)}
        className={cn(
          "hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm",
          task.status === "done" && "opacity-70",
        )}
      >
        <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">{task.short_id}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{task.title}</span>
          {showDetails && (task.epic || task.due_date) && (
            <span className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-2 text-xs">
              {task.epic && <EpicPill epic={task.epic} className="max-w-48" />}
              {task.due_date && (
                <span className={cn("shrink-0", overdue && "text-danger")}>Due {formatDate(task.due_date)}</span>
              )}
            </span>
          )}
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
          {type && <Badge variant={type.variant}>{type.label}</Badge>}
          {priority && <Badge variant={priority.variant}>{priority.label}</Badge>}
        </span>
        {task.assignee ? (
          <span className="shrink-0">
            <ActorAvatar actor={task.assignee} />
            <span className="sr-only">Assigned to {actorName(task.assignee)}</span>
          </span>
        ) : (
          <span className="shrink-0">
            <UnassignedAvatar />
            <span className="sr-only">Unassigned</span>
          </span>
        )}
      </Link>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${removeLabel}: ${task.short_id}`}
          title={removeLabel}
          className="text-muted-foreground mr-1 shrink-0 opacity-60 group-hover:opacity-100"
          onClick={() => onRemove(task)}
        >
          <XIcon />
        </Button>
      )}
    </li>
  );
}
