"use client";

import { ArchiveRestoreIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { taskHref } from "@/lib/client/board";
import { fullDate, timeAgo } from "@/lib/client/format";
import { LABEL_COLORS } from "@/lib/client/task-labels";
import type { Epic, Label, Project, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/** A project's settings: its name and description, its labels, and its archived tasks and epics. */
export function ProjectSettingsView({ projectKey }: { projectKey: string }) {
  const { data: project } = useSWR(`/projects/${projectKey}`, (path: string) =>
    api<{ data: Project }>(path).then((r) => r.data),
  );

  return (
    <main className="mx-auto flex w-full max-w-[77rem] flex-1 flex-col overflow-y-auto px-4 pb-8 [&>*]:shrink-0">
      <div className="flex max-w-3xl flex-col gap-10">
        {project ? <GeneralSection key={project.updated_at} project={project} /> : <Skeleton className="h-40 w-full" />}
        <LabelsSection projectKey={projectKey} />
        <ArchivedSection projectKey={projectKey} />
      </div>
    </main>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={id}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function GeneralSection({ project }: { project: Project }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== project.name || description !== project.description;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api<{ data: Project }>(`/projects/${project.key}`, {
        method: "PATCH",
        json: { name: name.trim(), description },
      });
      await mutate(`/projects/${project.key}`, data, { revalidate: false });
      void mutate("/projects");
      toast("Project saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section id="settings-general" title="General" description="The key can't change: it's part of every task ID.">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="grid gap-2">
            <FieldLabel htmlFor="project-name">Name</FieldLabel>
            <Input id="project-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="project-key">Key</FieldLabel>
            <Input id="project-key" value={project.key} disabled className="font-mono" />
          </div>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="project-description">Description</FieldLabel>
          <Textarea
            id="project-description"
            maxLength={10_000}
            rows={3}
            value={description}
            placeholder="What this project is about"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button type="submit" className="self-start" disabled={!changed || !name.trim() || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </Section>
  );
}

function LabelsSection({ projectKey }: { projectKey: string }) {
  const labelsKey = `/projects/${projectKey}/labels`;
  const { mutate } = useSWRConfig();
  const { data: labels, mutate: mutateLabels } = useSWR(labelsKey, (path: string) => apiAll<Label>(path));
  // Active tasks per label, from the board's cache.
  const { data: tasks } = useSWR(`/projects/${projectKey}/tasks`, (path: string) => apiAll<Task>(path));
  const usage = new Map<string, number>();
  for (const task of tasks ?? []) for (const label of task.labels) usage.set(label.id, (usage.get(label.id) ?? 0) + 1);

  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Label | null>(null);

  /** Labels show on cards and tasks, so refresh those too after a change. */
  const refreshTasks = () =>
    mutate((key) => typeof key === "string" && (key.startsWith(`/projects/${projectKey}/tasks`) || key.startsWith("/tasks/")));

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const color = LABEL_COLORS[(labels?.length ?? 0) % LABEL_COLORS.length];
      await api(labelsKey, { method: "POST", json: { name, color } });
      setNewName("");
      await mutateLabels();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function update(label: Label, change: Partial<Pick<Label, "name" | "color">>) {
    try {
      await api(`/labels/${label.id}`, { method: "PATCH", json: change });
      await mutateLabels();
      void refreshTasks();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }

  async function remove(label: Label) {
    try {
      await api(`/labels/${label.id}`, { method: "DELETE" });
      setDeleting(null);
      await mutateLabels();
      void refreshTasks();
      toast(`Label “${label.name}” deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Section id="settings-labels" title="Labels" description="Tags for this project's tasks. Agents use them by name.">
      <form onSubmit={create} className="flex max-w-md gap-2">
        <Input
          aria-label="New label name"
          placeholder="New label"
          maxLength={50}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!newName.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
      {!labels ? (
        <Skeleton className="h-24 w-full" />
      ) : labels.length === 0 ? (
        <p className="text-muted-foreground text-sm">No labels yet.</p>
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {labels.map((label) => (
            <LabelRow
              key={`${label.id}:${label.name}`}
              label={label}
              uses={usage.get(label.id) ?? 0}
              onUpdate={(change) => update(label, change)}
              onDelete={() => setDeleting(label)}
            />
          ))}
        </ul>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              {deleting && usage.get(deleting.id)
                ? `It's removed from ${usage.get(deleting.id)} task${usage.get(deleting.id) === 1 ? "" : "s"}; each task's activity records it. This can't be undone.`
                : "No active tasks use it. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={() => deleting && void remove(deleting)}>
              Delete label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function LabelRow({
  label,
  uses,
  onUpdate,
  onDelete,
}: {
  label: Label;
  uses: number;
  onUpdate: (change: Partial<Pick<Label, "name" | "color">>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(label.name);
  const [colorOpen, setColorOpen] = useState(false);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === label.name) return setName(label.name);
    if (!(await onUpdate({ name: trimmed }))) setName(label.name);
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger
          aria-label={`Colour of ${label.name}`}
          className="hover:ring-ring/50 focus-visible:ring-ring/50 flex size-6 shrink-0 items-center justify-center rounded-full outline-none hover:ring-2 focus-visible:ring-[3px]"
        >
          <span className="size-3.5 rounded-full" style={{ backgroundColor: label.color }} />
        </PopoverTrigger>
        <PopoverContent align="start" arrow={false} sideOffset={4} className="w-auto p-2">
          <div role="group" aria-label="Label colour" className="grid grid-cols-4 gap-1.5">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={color === label.color}
                onClick={() => {
                  setColorOpen(false);
                  if (color !== label.color) void onUpdate({ color });
                }}
                className={cn(
                  "focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px]",
                  color === label.color && "bg-accent",
                )}
              >
                <span className="size-4 rounded-full" style={{ backgroundColor: color }} />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        aria-label={`Name of ${label.name}`}
        value={name}
        maxLength={50}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setName(label.name);
        }}
        inputContainerClassName="max-w-64"
        className="hover:border-input h-8 border-transparent bg-transparent shadow-none"
      />
      <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
        {uses} task{uses === 1 ? "" : "s"}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${label.name}`} className="text-muted-foreground shrink-0" onClick={onDelete}>
        <Trash2Icon />
      </Button>
    </li>
  );
}

function ArchivedSection({ projectKey }: { projectKey: string }) {
  const { mutate } = useSWRConfig();
  const tasksKey = `/projects/${projectKey}/tasks?archived=true`;
  const epicsKey = `/projects/${projectKey}/epics?archived=true`;
  const { data: tasks } = useSWR(tasksKey, (path: string) => apiAll<Task>(path));
  const { data: epics } = useSWR(epicsKey, (path: string) => apiAll<Epic>(path));
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(path: string, id: string, what: string) {
    setRestoring(id);
    try {
      await api(path, { method: "POST" });
      // The archived lists, the board, the epics and the header counts all change.
      await mutate((key) => typeof key === "string" && (key.startsWith(`/projects/${projectKey}`) || key.startsWith("/tasks/") || key.startsWith("/epics/")));
      toast(`${what} restored`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Section id="settings-archived" title="Archived" description="Archived tasks and epics are hidden everywhere else. Restore them to bring them back.">
      <ArchivedList
        title="Tasks"
        items={tasks?.map((task) => ({
          id: task.id,
          href: taskHref(task),
          label: (
            <>
              <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">{task.short_id}</span>
              <span className="truncate">{task.title}</span>
            </>
          ),
          archivedAt: task.archived_at,
          onRestore: () => void restore(`/tasks/${task.id}/restore`, task.id, task.short_id),
        }))}
        restoring={restoring}
        empty="No archived tasks."
      />
      <ArchivedList
        title="Epics"
        items={epics?.map((epic) => ({
          id: epic.id,
          href: `/projects/${projectKey}/epics/${epic.id}`,
          label: <span className="truncate">{epic.title}</span>,
          archivedAt: epic.archived_at,
          onRestore: () => void restore(`/epics/${epic.id}/restore`, epic.id, `“${epic.title}”`),
        }))}
        restoring={restoring}
        empty="No archived epics."
      />
    </Section>
  );
}

function ArchivedList({
  title,
  items,
  restoring,
  empty,
}: {
  title: string;
  items?: { id: string; href: string; label: React.ReactNode; archivedAt: string | null; onRestore: () => void }[];
  restoring: string | null;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title}
        {items && <span className="text-muted-foreground ml-2 font-normal tabular-nums">{items.length}</span>}
      </h3>
      {!items ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                {item.label}
              </Link>
              {item.archivedAt && (
                <time className="text-muted-foreground hidden shrink-0 text-xs sm:block" dateTime={item.archivedAt} title={fullDate(item.archivedAt)}>
                  Archived {timeAgo(item.archivedAt)}
                </time>
              )}
              <Button variant="outline" size="sm" className="shrink-0" disabled={restoring === item.id} onClick={item.onRestore}>
                <ArchiveRestoreIcon /> Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
