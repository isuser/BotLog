import { COLUMNS } from "./board";
import type { Task, TaskStatus } from "./types";

export const STATUS_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.status, c.title])) as Record<TaskStatus, string>;

export const PRIORITY_LABELS: Record<Task["priority"], string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TYPE_LABELS: Record<Task["type"], string> = { feature: "Feature", bug: "Bug", improvement: "Improvement" };
