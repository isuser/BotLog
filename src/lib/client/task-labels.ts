import { COLUMNS } from "./board";
import type { EpicStatus, Task, TaskStatus } from "./types";

export const STATUS_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.status, c.title])) as Record<TaskStatus, string>;

export const PRIORITY_LABELS: Record<Task["priority"], string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TYPE_LABELS: Record<Task["type"], string> = { feature: "Feature", bug: "Bug", improvement: "Improvement" };

/** Each status's colours (design spec: meaning map). Full class names so Tailwind finds them. */
export const STATUS_COLORS: Record<TaskStatus, { edge: string; title: string; dot: string }> = {
  backlog: { edge: "border-t-status-backlog", title: "text-muted-foreground", dot: "bg-status-backlog" },
  todo: { edge: "border-t-status-todo", title: "text-status-todo", dot: "bg-status-todo" },
  in_progress: { edge: "border-t-status-in-progress", title: "text-brand-text", dot: "bg-status-in-progress inset-ring inset-ring-brand-outline" },
  done: { edge: "border-t-status-done", title: "text-status-done", dot: "bg-status-done" },
};

export const EPIC_STATUS_LABELS: Record<EpicStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
};

/** Epic status badges: lime while in progress (a fill, per the design), quiet otherwise. */
export const EPIC_STATUS_BADGE: Record<EpicStatus, "default" | "secondary" | "success" | "outline"> = {
  planned: "secondary",
  in_progress: "default",
  done: "success",
  canceled: "outline",
};

/** Board badges: only the types and priorities worth calling out get one. */
export const TYPE_BADGE: Partial<Record<Task["type"], { label: string; variant: "danger" | "info" }>> = {
  bug: { label: "Bug", variant: "danger" },
  improvement: { label: "Improvement", variant: "info" },
};

export const PRIORITY_BADGE: Partial<
  Record<Task["priority"], { label: string; variant: "danger" | "warning" | "secondary" }>
> = {
  urgent: { label: "Urgent", variant: "danger" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "secondary" },
  low: { label: "Low", variant: "secondary" },
};

/** Colours for labels: new ones take them in turn. Mid-tone so the dot reads on both themes. */
export const LABEL_COLORS = ["#84cc16", "#38bdf8", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#6b7280"];

/**
 * An epic's colour, picked from the label palette by its id, so it's stable without being
 * stored. Different epics usually, but not always, get different colours.
 */
export function epicColor(epicId: string): string {
  let hash = 0;
  for (const char of epicId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}
