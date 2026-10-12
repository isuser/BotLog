"use client";

import { ArchiveIcon, ArchiveRestoreIcon, LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiRequestError, isConflict } from "@/lib/client/api";
import { syncTask } from "@/lib/client/board";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Task, TaskStatus } from "@/lib/client/types";
import { taskHref } from "../../task-card";
import { TaskComments } from "./task-comments";
import { TaskDescription } from "./task-description";
import { TaskFields, TaskTitle, type CurrentUser, type FieldChange } from "./task-fields";

/** Side panel on wide screens, full-screen on phones. Closing it goes back to the board. */
export function TaskPanel({
  projectKey,
  taskRef,
  currentUser,
}: {
  projectKey: string;
  taskRef: string;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const { mutate: mutateKey } = useSWRConfig();
  const boardHref = `/projects/${projectKey}`;
  const { data: task, error, mutate } = useSWR(`/tasks/${taskRef}`, (path: string) =>
    api<{ data: Task }>(path).then((r) => r.data),
  );
  const [open, setOpen] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);

  // A task opened under another project's URL, or by UUID, moves to its own URL.
  useEffect(() => {
    if (task && (task.project_key !== projectKey || task.short_id !== taskRef)) {
      router.replace(taskHref(task), { scroll: false });
    }
  }, [task, projectKey, taskRef, router]);

  const syncBoard = (updated: Task) =>
    mutateKey(`/projects/${updated.project_key}/tasks`, (tasks?: Task[]) => tasks && syncTask(tasks, updated), {
      revalidate: false,
    });

  async function reportError(error: unknown) {
    const stale = isConflict(error) || (error instanceof ApiRequestError && error.code === "archived");
    if (!stale) return void toast.error(error instanceof Error ? error.message : "Something went wrong.");
    toast(isConflict(error) ? "This task was updated, reloaded" : (error as ApiRequestError).message);
    const latest = await mutate();
    if (latest) await syncBoard(latest);
  }

  // Saves run one at a time, each sending the version the previous one returned, so
  // quick successive edits don't conflict with each other.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Shows `preview` right away, sends the change, and resolves to whether it saved. */
  function save(preview: (task: Task) => Task, send: (task: Task) => Promise<{ data: Task }>): Promise<boolean> {
    if (!task) return Promise.resolve(false);
    const loaded = task;
    const run = async () => {
      try {
        const updated = await mutate(async (current) => current && (await send(current)).data, {
          optimisticData: (current) => preview(current ?? loaded),
          rollbackOnError: true,
          revalidate: false,
        });
        if (updated) await syncBoard(updated);
        return true;
      } catch (error) {
        await reportError(error);
        return false;
      }
    };
    const result = queue.current.then(run);
    queue.current = result;
    return result;
  }

  const update = (change: FieldChange) =>
    save(
      (t) => ({ ...t, ...change.preview }),
      (t) => api(`/tasks/${t.id}`, { method: "PATCH", json: { ...change.body, version: t.version } }),
    );

  const move = (status: TaskStatus) =>
    save(
      (t) => ({ ...t, status }),
      (t) => api(`/tasks/${t.id}/move`, { method: "POST", json: { status, version: t.version } }),
    );

  async function setArchived(archived: boolean) {
    if (!task) return;
    try {
      const { data } = await api<{ data: Task }>(`/tasks/${task.id}${archived ? "" : "/restore"}`, {
        method: archived ? "DELETE" : "POST",
      });
      await mutate(data, { revalidate: false });
      await syncBoard(data);
      if (archived) {
        setOpen(false);
        toast(`${data.short_id} archived`, { action: { label: "Undo", onClick: () => void restore(data) } });
      } else {
        toast(`${data.short_id} restored`);
      }
    } catch (error) {
      await reportError(error);
    }
  }

  // Undo from the toast, after the panel has closed.
  async function restore(archived: Task) {
    try {
      const { data } = await api<{ data: Task }>(`/tasks/${archived.id}/restore`, { method: "POST" });
      await mutate(data, { revalidate: false });
      await syncBoard(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function copyLink() {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(new URL(taskHref(task), window.location.origin).toString());
      toast("Link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const notFound = error instanceof ApiRequestError && (error.status === 404 || error.status === 400);
  const archived = Boolean(task?.archived_at);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => setOpen(next)}
      onOpenChangeComplete={(next) => {
        if (!next) router.push(boardHref, { scroll: false });
      }}
    >
      {/* Focus the panel itself on open, not its first button, so nothing looks selected. */}
      <SheetContent
        ref={popupRef}
        initialFocus={popupRef}
        className="w-[calc(100vw-2rem)] gap-0 sm:max-w-xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:rounded-none max-sm:border-0">
        <SheetTitle className="sr-only">{task ? `${task.short_id}: ${task.title}` : taskRef}</SheetTitle>
        <header className="flex h-14 shrink-0 items-center gap-1 border-b px-4 pr-12">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2 font-mono text-xs"
            onClick={copyLink}
            disabled={!task}
            aria-label={`Copy link to ${task?.short_id ?? taskRef}`}
          >
            {task?.short_id ?? taskRef}
            <LinkIcon />
          </Button>
          {task && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground ml-auto"
              onClick={() => void setArchived(!archived)}
            >
              {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {archived ? "Restore" : "Archive"}
            </Button>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6">
          {error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="font-medium">{notFound ? "Task not found" : "Couldn't load this task"}</p>
              {!notFound && <p className="text-muted-foreground text-sm">{error.message}</p>}
            </div>
          ) : !task ? (
            <PanelSkeleton />
          ) : (
            <>
              {archived && (
                <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
                  This task is archived. Restore it to make changes.
                </p>
              )}
              <TaskTitle key={task.title} task={task} disabled={archived} onSave={update} />
              <TaskFields task={task} currentUser={currentUser} disabled={archived} onChange={update} onMove={move} />
              <TaskDescription
                key={task.id}
                description={task.description}
                disabled={archived}
                onSave={(description) => update({ body: { description }, preview: { description } })}
              />
              <TaskComments taskId={task.id} />
              <p className="text-muted-foreground mt-auto text-xs">
                Created <time title={fullDate(task.created_at)}>{timeAgo(task.created_at)}</time> · Updated{" "}
                <time title={fullDate(task.updated_at)}>{timeAgo(task.updated_at)}</time>
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-7 w-3/4" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
