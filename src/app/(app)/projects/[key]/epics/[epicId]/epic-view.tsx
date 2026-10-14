"use client";

import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { DescriptionEditor } from "@/components/description-editor";
import { TaskGroups } from "@/components/task-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, apiAll, ApiRequestError, errorMessage, isConflict } from "@/lib/client/api";
import { EPIC_STATUS_LABELS } from "@/lib/client/task-labels";
import type { Epic, EpicStatus, Task } from "@/lib/client/types";
import { QuickAdd } from "../../(board)/quick-add";
import { EpicProgress } from "../epic-progress";
import { AddExistingTasks } from "./add-existing-tasks";

type EpicChange = Partial<Pick<Epic, "title" | "description" | "status" | "target_date">>;

/** One epic: its fields and description, its progress, and its tasks by status. */
export function EpicView({ projectKey, epicId }: { projectKey: string; epicId: string }) {
  const router = useRouter();
  const { mutate: mutateKey } = useSWRConfig();
  const epicsHref = `/projects/${projectKey}/epics`;
  const { data: epic, error, mutate } = useSWR(`/epics/${epicId}`, (path: string) =>
    api<{ data: Epic }>(path).then((r) => r.data),
  );
  const tasksKey = `/projects/${projectKey}/tasks?epic_id=${epicId}`;
  const { data: tasks, mutate: mutateTasks } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));

  /** Saves a change and refreshes the epics list, which shows the same fields. */
  async function save(change: EpicChange): Promise<boolean> {
    try {
      const { data } = await api<{ data: Epic }>(`/epics/${epicId}`, { method: "PATCH", json: change });
      await mutate(data, { revalidate: false });
      void mutateKey(epicsHref);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }

  async function setArchived(archived: boolean) {
    try {
      const { data } = await api<{ data: Epic }>(`/epics/${epicId}${archived ? "" : "/restore"}`, {
        method: archived ? "DELETE" : "POST",
      });
      await mutate(data, { revalidate: false });
      void mutateKey(epicsHref);
      if (archived) {
        toast(`“${data.title}” archived`, { action: { label: "Undo", onClick: () => void setArchived(false) } });
        router.push(epicsHref);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function addTask(title: string) {
    try {
      await api(`/projects/${projectKey}/tasks`, { method: "POST", json: { title, epic_id: epicId } });
      await Promise.all([mutateTasks(), mutate(), mutateKey(`/projects/${projectKey}/tasks`)]);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  /** Puts an existing task in this epic, or (epic null) takes it out, keeping the version check. */
  async function setTaskEpic(task: Task, epic: string | null) {
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", json: { epic_id: epic, version: task.version } });
    } catch (e) {
      toast[isConflict(e) ? "message" : "error"](isConflict(e) ? "This task was updated, reloaded" : errorMessage(e));
    }
    await Promise.all([mutateTasks(), mutate(), mutateKey(`/projects/${projectKey}/tasks`), mutateKey(epicsHref)]);
  }

  const notFound = error instanceof ApiRequestError && (error.status === 404 || error.status === 400);
  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-medium">{notFound ? "Epic not found" : "Couldn't load this epic"}</p>
        <Link href={epicsHref} className="text-sm underline">
          Back to epics
        </Link>
      </main>
    );
  }

  const archived = Boolean(epic?.archived_at);

  return (
    <main className="mx-auto flex w-full max-w-[77rem] flex-1 flex-col overflow-y-auto px-4 pb-8 [&>*]:shrink-0">
      <div className="flex max-w-3xl flex-col gap-6">
        <Link href={epicsHref} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm">
          <ArrowLeftIcon className="size-4" /> Epics
        </Link>

        {!epic ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {archived && (
              <div className="bg-muted text-muted-foreground flex items-center justify-between gap-3 rounded-md py-1 pr-1 pl-3 text-sm">
                This epic is archived. Restore it to make changes.
                <Button variant="outline" size="sm" onClick={() => void setArchived(false)}>
                  <ArchiveRestoreIcon /> Restore
                </Button>
              </div>
            )}
            <EpicTitle key={epic.title} title={epic.title} disabled={archived} onSave={(title) => save({ title })} />
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={epic.status}
                items={EPIC_STATUS_LABELS}
                disabled={archived}
                onValueChange={(status) => status && status !== epic.status && void save({ status: status as EpicStatus })}
              >
                <SelectTrigger aria-label="Status" className="bg-muted hover:bg-accent h-8 w-40 border-transparent shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EPIC_STATUS_LABELS) as EpicStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {EPIC_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TargetDate key={epic.target_date} value={epic.target_date} disabled={archived} onSave={(target_date) => save({ target_date })} />
              {!archived && (
                <Button variant="ghost" size="sm" className="text-muted-foreground ml-auto" onClick={() => void setArchived(true)}>
                  <ArchiveIcon /> Archive
                </Button>
              )}
            </div>
            <EpicProgress progress={epic.progress} />
            <DescriptionEditor
              key={epic.id}
              description={epic.description}
              disabled={archived}
              onSave={(description) => save({ description })}
            />
          </>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="epic-tasks">
          <h2 id="epic-tasks" className="text-sm font-semibold">
            Tasks
          </h2>
          {!archived && (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <QuickAdd columnTitle="this epic" onAdd={addTask} />
              </div>
              <AddExistingTasks projectKey={projectKey} epicId={epicId} onAdd={(task) => setTaskEpic(task, epicId)} />
            </div>
          )}
          {!tasks ? (
            <Skeleton className="h-24 w-full" />
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tasks in this epic yet.</p>
          ) : (
            <TaskGroups
              tasks={tasks}
              removeLabel="Remove from epic"
              onRemove={archived ? undefined : (task) => void setTaskEpic(task, null)}
            />
          )}
        </section>
      </div>
    </main>
  );
}

/** The title, edited in place. Enter or leaving the field saves; Escape reverts. */
function EpicTitle({ title, disabled, onSave }: { title: string; disabled: boolean; onSave: (title: string) => Promise<boolean> }) {
  const [value, setValue] = useState(title);
  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return setValue(title);
    if (trimmed !== title) void onSave(trimmed);
  }
  return (
    <Textarea
      aria-label="Epic title"
      value={value}
      maxLength={500}
      rows={1}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setValue(title);
          requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur());
        }
      }}
      className="font-display hover:border-input -mx-3 min-h-0 resize-none border-transparent bg-transparent text-2xl font-bold shadow-none md:text-2xl"
    />
  );
}

/** Saved when the field loses focus. */
function TargetDate({ value, disabled, onSave }: { value: string | null; disabled: boolean; onSave: (date: string | null) => Promise<boolean> }) {
  const [date, setDate] = useState(value ?? "");
  return (
    <Input
      type="date"
      aria-label="Target date"
      value={date}
      disabled={disabled}
      onChange={(e) => setDate(e.target.value)}
      onBlur={() => (date || null) !== value && void onSave(date || null)}
      inputContainerClassName="w-44"
      className="bg-muted hover:bg-accent h-8 border-transparent shadow-none"
    />
  );
}
