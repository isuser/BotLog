"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ActorAvatar, actorName, UnassignedAvatar } from "@/components/actor-avatar";
import { EpicPill } from "@/components/epic-pill";
import { LabelChip } from "@/components/label-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, isConflict } from "@/lib/client/api";
import { flatten, groupByStatus, syncTask, taskHref } from "@/lib/client/board";
import { PRIORITY_BADGE, TYPE_BADGE } from "@/lib/client/task-labels";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { AssigneePicker } from "../(board)/assignee-picker";
import { QuickAdd } from "../(board)/quick-add";
import { usePrefetchTaskRoute } from "../(board)/task-card";

/**
 * The project's backlog as a ranked list: drag to reorder, and send a task to the board's
 * To do column when it's ready. Opening a row shows the task over the backlog.
 */
export function BacklogView({ projectKey }: { projectKey: string }) {
  // The board's key: shared cache, realtime refreshes, and edits from the panel stay in sync.
  const tasksKey = `/projects/${projectKey}/tasks`;
  const { data: tasks, error, mutate } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));
  usePrefetchTaskRoute(tasks, "backlog");
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Enter opens a task, so only Space picks one up.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  /** The whole task list with the backlog replaced by `backlog`, in board order. */
  const withBacklog = (current: Task[], backlog: Task[]) => flatten({ ...groupByStatus(current), backlog });

  async function send<T>(request: Promise<T>) {
    try {
      return await request;
    } catch (e) {
      if (isConflict(e)) toast("This task was updated, reloaded");
      else toast.error(e instanceof Error ? e.message : "Something went wrong.");
      void mutate();
      throw e;
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null);
    if (!tasks || !over || active.id === over.id) return;
    const backlog = groupByStatus(tasks).backlog;
    const from = backlog.findIndex((t) => t.id === active.id);
    const to = backlog.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;

    const reordered = arrayMove(backlog, from, to);
    const task = backlog[from];
    const above = reordered[to - 1];
    const below = reordered[to + 1];
    const optimistic = withBacklog(tasks, reordered);
    await send(
      mutate(
        async () => {
          const { data } = await api<{ data: Task }>(`/tasks/${task.id}/move`, {
            method: "POST",
            json: { status: "backlog", ...(above ? { after_id: above.id } : { before_id: below.id }), version: task.version },
          });
          return syncTask(optimistic, data);
        },
        { optimisticData: optimistic, rollbackOnError: true, populateCache: true, revalidate: false },
      ),
    ).catch(() => {});
  }

  async function moveToTodo(task: Task) {
    const optimistic = (tasks ?? []).filter((t) => t.id !== task.id);
    const moved = await send(
      mutate(
        async (current) => {
          const { data } = await api<{ data: Task }>(`/tasks/${task.id}/move`, {
            method: "POST",
            json: { status: "todo", version: task.version },
          });
          return syncTask(current ?? [], data);
        },
        { optimisticData: optimistic, rollbackOnError: true, populateCache: true, revalidate: false },
      ),
    ).catch(() => null);
    if (moved) toast(`${task.short_id} moved to To do`);
  }

  async function addTask(title: string) {
    const { data } = await send(
      api<{ data: Task }>(tasksKey, { method: "POST", json: { title, status: "backlog" } }),
    );
    await mutate((current) => withBacklog(current ?? [], [data, ...groupByStatus(current ?? []).backlog]), {
      revalidate: false,
    });
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-medium">Couldn&apos;t load the backlog</p>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </main>
    );
  }
  if (!tasks) return <BacklogSkeleton />;

  const backlog = groupByStatus(tasks).backlog;

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[60rem] flex-1 flex-col gap-3 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-md">
          <QuickAdd columnTitle="the backlog" onAdd={addTask} focusOnShortcut />
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {backlog.length} {backlog.length === 1 ? "task" : "tasks"}
        </p>
      </div>
      {backlog.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-xl border border-dashed py-16 text-center text-sm">
          <p className="text-foreground font-medium">The backlog is empty</p>
          <p>Add ideas and later work here. Move a task to To do when it&apos;s ready for the board.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }: DragStartEvent) => setActiveTask(backlog.find((t) => t.id === active.id) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
          accessibility={{ screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
        >
          <SortableContext items={backlog.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Backlog" className="bg-card min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border">
              {backlog.map((task) => (
                <SortableBacklogRow key={task.id} task={task} onMoveToTodo={moveToTodo} />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay>{activeTask ? <BacklogRow task={activeTask} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </main>
  );
}

const DRAG_INSTRUCTIONS =
  "Press Enter to open the task. To pick it up, press Space. While dragging, use the arrow keys to move it, " +
  "then press Space to drop it or Escape to cancel.";

/** Stops an event inside a row's controls from reaching the row, which would open the task or start a drag. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function BacklogRow({
  task,
  dragging = false,
  selected = false,
  actions,
}: {
  task: Task;
  dragging?: boolean;
  selected?: boolean;
  actions?: React.ReactNode;
}) {
  const type = TYPE_BADGE[task.type];
  const priority = PRIORITY_BADGE[task.priority];
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm",
        !dragging && "hover:bg-accent/50 cursor-pointer",
        selected && "bg-accent/60",
        dragging && "bg-card ring-ring/50 rounded-lg shadow-lg ring-2",
      )}
    >
      <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">{task.short_id}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{task.title}</span>
        {task.labels.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {task.labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
          </span>
        )}
      </span>
      {task.epic && <EpicPill epic={task.epic} className="hidden max-w-40 sm:inline-flex" />}
      {type && <Badge variant={type.variant} className="hidden sm:inline-flex">{type.label}</Badge>}
      {priority && <Badge variant={priority.variant}>{priority.label}</Badge>}
      {actions ?? (
        <span className="flex">
          {task.assignee ? <ActorAvatar actor={task.assignee} /> : <UnassignedAvatar />}
          <span className="sr-only">{task.assignee ? `Assigned to ${actorName(task.assignee)}` : "Unassigned"}</span>
        </span>
      )}
    </div>
  );
}

/** A draggable row. Click, tap or Enter opens the task; Space picks it up. */
function SortableBacklogRow({ task, onMoveToTodo }: { task: Task; onMoveToTodo: (task: Task) => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const router = useRouter();
  const { taskId } = useParams<{ taskId?: string }>();
  const href = taskHref(task, "backlog");

  function open(newTab: boolean) {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href, { scroll: false });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "focus-visible:ring-ring/50 relative touch-manipulation list-none outline-none focus-visible:ring-[3px] focus-visible:ring-inset",
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
      <BacklogRow
        task={task}
        selected={taskId?.toUpperCase() === task.short_id}
        actions={
          <span className="flex items-center gap-2">
            <AssigneePicker task={task} />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${task.short_id} to To do`}
              title="Move to To do"
              onPointerDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                void onMoveToTodo(task);
              }}
            >
              <span className="hidden sm:inline">To do</span>
              <ArrowRightIcon className="size-4" />
            </Button>
          </span>
        }
      />
    </li>
  );
}

export function BacklogSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-3 px-4">
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
