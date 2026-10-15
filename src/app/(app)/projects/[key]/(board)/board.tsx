"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, ApiRequestError, isConflict } from "@/lib/client/api";
import {
  BOARD_COLUMNS,
  flatten,
  groupByStatus,
  inDoneWindow,
  moveToColumn,
  placement,
  reorderInColumn,
  replaceTask,
  samePlacement,
  type Columns,
} from "@/lib/client/board";
import type { Project, Task, TaskStatus } from "@/lib/client/types";
import { BoardColumn } from "./board-column";
import { TaskCard } from "./task-card";

export function Board({ projectKey }: { projectKey: string }) {
  const { data: project, error: projectError } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  // Refetched whenever the window regains focus (SWR's default), so changes made by
  // agents or other tabs show up when you come back.
  const tasksKey = `/projects/${projectKey}/tasks`;
  const { data: tasks, error: tasksError, mutate } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));

  // While dragging, the board shows this local copy instead of the fetched tasks.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const dragRef = useRef<{ start: Columns; current: Columns } | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Columns hold every active task, backlog and older Done ones included, so moves keep their
  // places; the board just doesn't show those.
  const columns = useMemo(() => dragColumns ?? groupByStatus(tasks ?? []), [dragColumns, tasks]);
  // When the board opened; good enough for a window counted in days.
  const [now] = useState(() => Date.now());
  const doneWindow = project?.done_window_days ?? 14;
  const recentDone = columns.done.filter((t) => inDoneWindow(t, doneWindow, now));
  const olderDone = columns.done.length - recentDone.length;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Enter opens a task, so only Space picks one up.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const updateDrag = (next: Columns) => {
    if (!dragRef.current) return;
    dragRef.current.current = next;
    setDragColumns(next);
  };

  function onDragStart({ active }: DragStartEvent) {
    const start = groupByStatus(tasks ?? []);
    dragRef.current = { start, current: start };
    setDragColumns(start);
    setActiveTask(tasks?.find((t) => t.id === active.id) ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragRef.current) return;
    updateDrag(moveToColumn(dragRef.current.current, String(active.id), String(over.id)));
  }

  function endDrag() {
    dragRef.current = null;
    setDragColumns(null);
    setActiveTask(null);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const drag = dragRef.current;
    const taskId = String(active.id);
    const task = tasks?.find((t) => t.id === taskId);
    if (!drag || !task) return endDrag();

    const final = over ? reorderInColumn(drag.current, taskId, String(over.id)) : drag.start;
    const target = placement(final, taskId);
    if (!target || samePlacement(drag.start, final, taskId)) return endDrag();

    const optimistic = flatten(final);
    const request = mutate(
      async () => {
        const { data } = await api<{ data: Task }>(`/tasks/${task.id}/move`, {
          method: "POST",
          json: { ...target, version: task.version },
        });
        return replaceTask(optimistic, data);
      },
      { optimisticData: optimistic, rollbackOnError: true, populateCache: true, revalidate: false },
    );
    endDrag();
    try {
      await request;
    } catch (error) {
      reportError(error);
      void mutate();
    }
  }

  async function addTask(status: TaskStatus, title: string) {
    try {
      const { data } = await api<{ data: Task }>(`/projects/${projectKey}/tasks`, {
        method: "POST",
        json: { title, status },
      });
      await mutate(
        (current) => {
          const grouped = groupByStatus(current ?? []);
          return flatten({ ...grouped, [status]: [data, ...grouped[status]] });
        },
        { revalidate: false },
      );
    } catch (error) {
      reportError(error);
      throw error;
    }
  }

  if (projectError || tasksError) {
    const notFound = projectError instanceof ApiRequestError && projectError.status === 404;
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{notFound ? "Project not found" : "Couldn't load this board"}</p>
        {!notFound && <p className="text-muted-foreground text-sm">{(projectError ?? tasksError).message}</p>}
        <Link href="/" className="text-sm underline">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col pb-4">
      {!tasks ? (
        <BoardSkeleton />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={endDrag}
          accessibility={{ screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
        >
          <div className="flex flex-1 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 sm:snap-none">
            {/* Centred while the columns fit; scrolls from the left edge when they don't. */}
            <div className="mx-auto flex w-max gap-4">
              {BOARD_COLUMNS.map(({ status, title }) => (
                <BoardColumn
                  key={status}
                  status={status}
                  title={title}
                  tasks={status === "done" ? recentDone : columns[status]}
                  onAdd={addTask}
                  footer={
                    status === "done" && olderDone > 0 ? (
                      <p className="text-muted-foreground px-1 text-xs">
                        {olderDone} {olderDone === 1 ? "task" : "tasks"} done over {doneWindow} days ago.{" "}
                        <Link href={`/projects/${projectKey}/list`} className="underline">
                          See them in List
                        </Link>
                      </p>
                    ) : null
                  }
                />
              ))}
            </div>
          </div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </main>
  );
}

const DRAG_INSTRUCTIONS =
  "Press Enter to open the task. To pick it up, press Space. While dragging, use the arrow keys to move it, " +
  "then press Space to drop it or Escape to cancel.";

function reportError(error: unknown) {
  if (isConflict(error)) toast("This task was updated, reloaded");
  else toast.error(error instanceof Error ? error.message : "Something went wrong.");
}

export function BoardSkeleton() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[60rem] flex-1 justify-center gap-4 overflow-hidden px-4">
      {BOARD_COLUMNS.map(({ status }) => (
        <Skeleton key={status} className="h-full w-[85vw] max-w-80 shrink-0 rounded-xl sm:w-72" />
      ))}
    </div>
  );
}
