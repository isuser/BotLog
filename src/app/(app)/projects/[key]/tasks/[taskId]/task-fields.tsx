"use client";

import { useState } from "react";
import useSWR from "swr";
import { ActorAvatar, actorName, type Actor } from "@/components/actor-avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiAll } from "@/lib/client/api";
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/task-labels";
import type { Agent, Task, TaskStatus } from "@/lib/client/types";

export type CurrentUser = { id: string; email: string };

type UpdateBody = Partial<Pick<Task, "title" | "description" | "type" | "priority" | "due_date">> & {
  assignee?: { type: "user" | "agent"; id: string } | null;
};

/** A PATCH body, plus how the task should look until the API answers. */
export type FieldChange = { body: UpdateBody; preview: Partial<Task> };

const field = (body: UpdateBody & Partial<Task>): FieldChange => ({ body, preview: body as Partial<Task> });

/** The title, edited in place. Enter or leaving the field saves; Escape reverts. */
export function TaskTitle({
  task,
  disabled,
  onSave,
}: {
  task: Task;
  disabled: boolean;
  onSave: (change: FieldChange) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(task.title);

  function commit() {
    const trimmed = title.trim();
    if (!trimmed) return setTitle(task.title);
    if (trimmed !== task.title) void onSave(field({ title: trimmed }));
  }

  return (
    <Textarea
      aria-label="Title"
      value={title}
      maxLength={500}
      rows={1}
      disabled={disabled}
      onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          // Revert instead of closing the panel.
          e.stopPropagation();
          setTitle(task.title);
          requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur());
        }
      }}
      className="hover:border-input -mx-3 min-h-0 resize-none border-transparent bg-transparent text-lg font-semibold shadow-none md:text-lg"
    />
  );
}

const assigneeValue = (assignee: Task["assignee"]) => (assignee ? `${assignee.type}:${assignee.id}` : "none");

export function TaskFields({
  task,
  currentUser,
  disabled,
  onChange,
  onMove,
}: {
  task: Task;
  currentUser: CurrentUser;
  disabled: boolean;
  onChange: (change: FieldChange) => Promise<boolean>;
  onMove: (status: TaskStatus) => Promise<boolean>;
}) {
  const { data: agents } = useSWR("/agents", (path: string) => apiAll<Agent>(path));

  // Unassigned, you, the workspace's active agents, and whoever the task is assigned to now
  // (which may be an archived agent).
  const me: Actor = { type: "user", id: currentUser.id, name: "", email: currentUser.email };
  const assignees = new Map<string, Actor | null>([
    ["none", null],
    [assigneeValue(me), task.assignee?.type === "user" && task.assignee.id === me.id ? task.assignee : me],
  ]);
  for (const agent of agents ?? []) {
    const actor: Actor = { type: "agent", id: agent.id, name: agent.name, avatar: agent.avatar };
    assignees.set(assigneeValue(actor), actor);
  }
  if (task.assignee) assignees.set(assigneeValue(task.assignee), task.assignee);
  const assigneeLabel = (actor: Actor | null) =>
    !actor ? "Unassigned" : actor.type === "user" && actor.id === me.id ? "Me" : actorName(actor);

  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
      <Field label="Status">
        <FieldSelect
          label="Status"
          value={task.status}
          items={STATUS_LABELS}
          disabled={disabled}
          onChange={(status) => void onMove(status)}
        />
      </Field>
      <Field label="Priority">
        <FieldSelect
          label="Priority"
          value={task.priority}
          items={PRIORITY_LABELS}
          disabled={disabled}
          onChange={(priority) => void onChange(field({ priority }))}
        />
      </Field>
      <Field label="Type">
        <FieldSelect
          label="Type"
          value={task.type}
          items={TYPE_LABELS}
          disabled={disabled}
          onChange={(type) => void onChange(field({ type }))}
        />
      </Field>
      <Field label="Assignee">
        <Select
          value={assigneeValue(task.assignee)}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === null || value === assigneeValue(task.assignee)) return;
            const actor = assignees.get(String(value)) ?? null;
            void onChange({
              body: { assignee: actor && { type: actor.type, id: actor.id } },
              preview: { assignee: actor },
            });
          }}
        >
          <SelectTrigger aria-label="Assignee" className="w-full max-w-64 border-transparent bg-transparent shadow-none">
            <SelectValue>
              {(value: string) => <AssigneeOption actor={assignees.get(value) ?? null} label={assigneeLabel} />}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[...assignees].map(([value, actor]) => (
              <SelectItem key={value} value={value}>
                <AssigneeOption actor={actor} label={assigneeLabel} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Due date">
        <DueDate key={task.due_date} value={task.due_date} disabled={disabled} onChange={onChange} />
      </Field>
    </dl>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function FieldSelect<T extends string>({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  items: Record<T, string>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      items={items}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null && next !== value) onChange(next as T);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full max-w-64 border-transparent bg-transparent shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(items) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {items[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AssigneeOption({ actor, label }: { actor: Actor | null; label: (actor: Actor | null) => string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {actor ? <ActorAvatar actor={actor} className="size-5" /> : <span className="size-5 rounded-full border border-dashed" />}
      <span className="truncate">{label(actor)}</span>
    </span>
  );
}

/** Saved when the field loses focus, so typing a date doesn't save every keystroke. */
function DueDate({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (change: FieldChange) => Promise<boolean>;
}) {
  const [date, setDate] = useState(value ?? "");

  function commit() {
    const next = date || null;
    if (next !== value) void onChange(field({ due_date: next }));
  }

  return (
    <Input
      type="date"
      aria-label="Due date"
      value={date}
      disabled={disabled}
      onChange={(e) => setDate(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      inputContainerClassName="max-w-64"
      className="border-transparent bg-transparent shadow-none"
    />
  );
}
