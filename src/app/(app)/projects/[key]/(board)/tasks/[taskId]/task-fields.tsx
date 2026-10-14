"use client";

import { CalendarIcon, CircleDotIcon, LayersIcon, SignalIcon, TagIcon, TagsIcon, UserIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { ActorAvatar, actorName, type Actor } from "@/components/actor-avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiAll } from "@/lib/client/api";
import { PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/task-labels";
import type { Agent, Epic, Task, TaskStatus } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { PRIORITY_BADGE, TYPE_BADGE } from "../../task-card";
import { LabelPicker } from "./label-picker";

export type CurrentUser = { id: string; email: string };

type UpdateBody = Partial<Pick<Task, "title" | "description" | "type" | "priority" | "due_date" | "epic_id">> & {
  assignee?: { type: "user" | "agent"; id: string } | null;
  label_ids?: string[];
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

/** Every field's control: a filled box, so each value reads as a field beside its label. */
const CONTROL = "bg-muted hover:bg-accent h-8 w-full max-w-56 border-transparent shadow-none transition-colors";

/** Status as a dot in its column colour, priority and type as the board's badges. */
function StatusValue({ status }: { status: TaskStatus }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full", STATUS_COLORS[status].dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function BadgeValue<T extends string>({
  value,
  labels,
  badges,
}: {
  value: T;
  labels: Record<T, string>;
  badges: Partial<Record<T, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }>>;
}) {
  const badge = badges[value];
  return badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <span>{labels[value]}</span>;
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
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
      <Field label="Status" icon={CircleDotIcon}>
        <FieldSelect
          label="Status"
          value={task.status}
          items={STATUS_LABELS}
          render={(status) => <StatusValue status={status} />}
          disabled={disabled}
          onChange={(status) => void onMove(status)}
        />
      </Field>
      <Field label="Priority" icon={SignalIcon}>
        <FieldSelect
          label="Priority"
          value={task.priority}
          items={PRIORITY_LABELS}
          render={(priority) => <BadgeValue value={priority} labels={PRIORITY_LABELS} badges={PRIORITY_BADGE} />}
          disabled={disabled}
          onChange={(priority) => void onChange(field({ priority }))}
        />
      </Field>
      <Field label="Type" icon={TagIcon}>
        <FieldSelect
          label="Type"
          value={task.type}
          items={TYPE_LABELS}
          render={(type) => <BadgeValue value={type} labels={TYPE_LABELS} badges={TYPE_BADGE} />}
          disabled={disabled}
          onChange={(type) => void onChange(field({ type }))}
        />
      </Field>
      <Field label="Assignee" icon={UserIcon}>
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
          <SelectTrigger aria-label="Assignee" className={CONTROL}>
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
      <Field label="Due date" icon={CalendarIcon}>
        <DueDate key={task.due_date} value={task.due_date} disabled={disabled} onChange={onChange} />
      </Field>
      <Field label="Epic" icon={LayersIcon}>
        <EpicSelect task={task} disabled={disabled} onChange={onChange} />
      </Field>
      <Field label="Labels" icon={TagsIcon}>
        <LabelPicker
          task={task}
          disabled={disabled}
          className={CONTROL}
          onChange={(labels) =>
            onChange({ body: { label_ids: labels.map((l) => l.id) }, preview: { labels } })
          }
        />
      </Field>
    </dl>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function FieldSelect<T extends string>({
  label,
  value,
  items,
  render = (value) => items[value],
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  items: Record<T, string>;
  /** How a value shows, in the field and in the list. Plain text by default. */
  render?: (value: T) => React.ReactNode;
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
      <SelectTrigger aria-label={label} className={CONTROL}>
        <SelectValue>{(current: T) => render(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(items) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {render(key)}
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

/** The project's active epics, plus the task's current one even if it's archived. */
function EpicSelect({
  task,
  disabled,
  onChange,
}: {
  task: Task;
  disabled: boolean;
  onChange: (change: FieldChange) => Promise<boolean>;
}) {
  const { data: epics } = useSWR(`/projects/${task.project_key}/epics`, (path: string) => apiAll<Epic>(path));
  const options = new Map<string, Task["epic"]>([["none", null]]);
  for (const epic of epics ?? []) options.set(epic.id, { id: epic.id, title: epic.title, status: epic.status });
  if (task.epic) options.set(task.epic.id, task.epic);

  return (
    <Select
      value={task.epic_id ?? "none"}
      disabled={disabled}
      onValueChange={(value) => {
        const next = value === "none" || value === null ? null : String(value);
        if (next === task.epic_id) return;
        void onChange({ body: { epic_id: next }, preview: { epic_id: next, epic: next ? (options.get(next) ?? null) : null } });
      }}
    >
      <SelectTrigger aria-label="Epic" className={CONTROL}>
        <SelectValue>{(value: string) => <span className="truncate">{options.get(value)?.title ?? "No epic"}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {[...options].map(([value, epic]) => (
          <SelectItem key={value} value={value}>
            {epic?.title ?? "No epic"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      inputContainerClassName="max-w-56"
      className={cn(CONTROL, "max-w-none")}
    />
  );
}
