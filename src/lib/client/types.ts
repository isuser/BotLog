import type { serializeComment } from "@/lib/api/comments";
import type { serializeProject } from "@/lib/api/projects";
import type { TASK_STATUSES } from "@/lib/api/schemas";
import type { serializeTask } from "@/lib/api/tasks";

// The shapes the API returns, taken from its serializers so client and server can't drift.
export type Project = ReturnType<typeof serializeProject>;
export type Task = ReturnType<typeof serializeTask>;
export type Comment = ReturnType<typeof serializeComment>;
export type TaskStatus = (typeof TASK_STATUSES)[number];
