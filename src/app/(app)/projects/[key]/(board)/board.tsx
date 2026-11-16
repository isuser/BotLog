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
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiAll, ApiRequestError, isConflict, ambiguousMatches } from "@/lib/client/api";
import {
  BOARD_COLUMNS,
  flatten,
  groupByColumn,
  inDoneWindow,
  moveToColumn,
  moveWhileSorted,
  placement,
  reorderInColumn,
  replaceTask,
  samePlacement,
  visibleColumns,
  type Columns,
} from "@/lib/client/board";
import { applyBoardView, boardViewQuery, isFiltered, pruneBoardView } from "@/lib/client/board-view";
import type { BoardColumn as Column, Epic, Label, Project, Task } from "@/lib/client/types";
import { useBoardView } from "@/lib/client/use-board-view";
import { BoardColumn } from "./board-column";
import { BoardToolbar } from "./board-toolbar";
import { TaskCard, useOpenNewTask, usePrefetchTaskRoute } from "./task-card";

export function Board({ projectKey }: { projectKey: string }) {
  const { data: project, error: projectError } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );
  // Refetched whenever the window regains focus (SWR's default), so changes made by
  // agents or other tabs show up when you come back.
  const tasksKey = `/projects/${projectKey}/tasks`;
  const { data: tasks, error: tasksError, mutate } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));
  usePrefetchTaskRoute(tasks, "board");
  const openNewTask = useOpenNewTask("board");
  // Filters and sort from the URL. They only change what each column shows, not the columns
  // themselves, so drags and moves still work on every task.
  const [urlView, setView] = useBoardView();
  const { data: labels } = useSWR(`/projects/${projectKey}/labels`, (path: string) => apiAll<Label>(path));
  const { data: epics } = useSWR(`/projects/${projectKey}/epics`, (path: string) => apiAll<Epic>(path));
  // Labels and epics the project no longer has don't filter (or count as picked).
  const view = useMemo(
    () => pruneBoardView(urlView, { labels: labels?.map((l) => l.id), epics: epics?.map((e) => e.id) }),
    [urlView, labels, epics],
  );
  const filtered = isFiltered(view);
  // Sorted by ID or priority, the sort decides each column's order: drags change the column only.
  const sorted = view.sort !== "manual";
  // Tasks added here while filtered stay shown even if they don't match, so they don't seem to
  // vanish, until the view next changes.
  const viewQuery = boardViewQuery(view);
  const [added, setAdded] = useState<{ query: string; ids: string[] }>({ query: "", ids: [] });
  const keep = added.query === viewQuery ? added.ids : [];
  // Every column, hidden ones and the Backlog included, so each task has a place.
  const { data: projectColumns, error: columnsError } = useSWR(`/projects/${projectKey}/columns`, (path: string) =>
    apiAll<Column>(path),
  );
  const columnIds = useMemo(() => (projectColumns ?? []).map((c) => c.id), [projectColumns]);
  const statusOf = (columnId: string) => projectColumns?.find((c) => c.id === columnId)?.counts_as;

  // While dragging, the board shows this local copy instead of the fetched tasks.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const dragRef = useRef<{ start: Columns; current: Columns } | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Columns hold every active task, backlog and older Done ones included, so moves keep their
  // places; the board just doesn't show those.
  const columns = useMemo(
    () => dragColumns ?? groupByColumn(tasks ?? [], columnIds),
    [dragColumns, tasks, columnIds],
  );
  const shown = visibleColumns(projectColumns ?? [], columns);
  // When the board opened; good enough for a window counted in days.
  const [now] = useState(() => Date.now());
  const doneWindow = project?.done_window_days ?? 14;
  const doneColumn = projectColumns?.find((c) => c.kind === "done");
  const allDone = doneColumn ? (columns[doneColumn.id] ?? []) : [];
  const recentDone = allDone.filter((t) => inDoneWindow(t, doneWindow, now));
  const olderDone = allDone.length - recentDone.length;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Enter opens a task, so only Space picks one up.
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const updateDrag = (next: Columns) => {
    if (!dragRef.current) return;
    dragRef.current.current = next;
    setDragColumns(next);
  };

  function onDragStart({ active }: DragStartEvent) {
    const start = groupByColumn(tasks ?? [], columnIds);
    dragRef.current = { start, current: start };
    setDragColumns(start);
    setActiveTask(tasks?.find((t) => t.id === active.id) ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragRef.current) return;
    const { start, current } = dragRef.current;
    updateDrag(
      sorted
        ? moveWhileSorted(start, current, String(active.id), String(over.id), statusOf)
        : moveToColumn(current, String(active.id), String(over.id), statusOf),
    );
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

    const final = !over ? drag.start : sorted ? drag.current : reorderInColumn(drag.current, taskId, String(over.id));
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

  async function addTask(columnId: string, title: string) {
    try {
      const { data } = await api<{ data: Task }>(`/projects/${projectKey}/tasks`, {
        method: "POST",
        json: { title, column_id: columnId },
      });
      setAdded((current) => ({ query: viewQuery, ids: [...(current.query === viewQuery ? current.ids : []), data.id] }));
      await mutate(
        (current) => {
          const grouped = groupByColumn(current ?? [], columnIds);
          return flatten({ ...grouped, [columnId]: [data, ...(grouped[columnId] ?? [])] });
        },
        { revalidate: false },
      );
      openNewTask(data);
    } catch (error) {
      reportError(error);
      throw error;
    }
  }

  // The project header lists the projects a bare, ambiguous key could mean.
  if (ambiguousMatches(projectError)) return null;
  if (projectError || tasksError || columnsError) {
    const notFound = projectError instanceof ApiRequestError && projectError.status === 404;
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{notFound ? "Project not found" : "Couldn't load this board"}</p>
        {!notFound && (
          <p className="text-muted-foreground text-sm">{(projectError ?? tasksError ?? columnsError).message}</p>
        )}
        <Link href="/" className="text-sm underline">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col pb-4">
      <BoardToolbar view={view} onChange={setView} labels={labels} epics={epics} />
      {!tasks || !projectColumns ? (
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
              {shown.map((column) => {
                const all = column.kind === "done" ? recentDone : (columns[column.id] ?? []);
                return (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    tasks={applyBoardView(all, view, keep)}
                    total={filtered ? all.length : undefined}
                    onAdd={addTask}
                    sorted={sorted}
                    // The `c` shortcut focuses the first column's quick add.
                    focusOnShortcut={column.id === shown[0]?.id}
                    footer={
                      column.kind === "done" && olderDone > 0 ? (
                        <p className="text-muted-foreground px-1 text-xs">
                          {olderDone} {olderDone === 1 ? "task" : "tasks"} done over {doneWindow} days ago.{" "}
                          <Link href={`/projects/${projectKey}/list`} className="underline">
                            See them in List
                          </Link>
                        </p>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          </div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </main>
  );
}

/**
 * dnd-kit's keyboard moves, with a fix for Left and Right. It counts a card as "to the right" if
 * its left edge is even a pixel right of the dragged card's, and the tilted drag overlay is a little
 * wider than the cards, so cards in the same column passed and Right moved down instead. Shifting
 * the dragged card's rect a quarter of its width that way first leaves only the neighbouring columns.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const rect = args.context.collisionRect;
  const sign = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (!rect || sign === 0) return sortableKeyboardCoordinates(event, args);
  const shift = (sign * rect.width) / 4;
  const collisionRect = { ...rect, left: rect.left + shift, right: rect.right + shift };
  return sortableKeyboardCoordinates(event, { ...args, context: { ...args.context, collisionRect } });
};

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
