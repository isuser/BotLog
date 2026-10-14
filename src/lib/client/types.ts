import type { serializeActivity } from "@/lib/api/activity";
import type { serializeAgent, serializeApiKey } from "@/lib/api/agents";
import type { serializeComment } from "@/lib/api/comments";
import type { serializeEpic } from "@/lib/api/epics";
import type { serializeLabel } from "@/lib/api/labels";
import type { serializeProfile } from "@/lib/api/profile";
import type { serializeProject } from "@/lib/api/projects";
import type { EPIC_STATUSES, TASK_STATUSES } from "@/lib/api/schemas";
import type { serializeTask } from "@/lib/api/tasks";

// The shapes the API returns, taken from its serializers so client and server can't drift.
export type Project = ReturnType<typeof serializeProject>;
export type Task = ReturnType<typeof serializeTask>;
export type Activity = ReturnType<typeof serializeActivity>;
export type Comment = ReturnType<typeof serializeComment>;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Epic = ReturnType<typeof serializeEpic>;
export type EpicStatus = (typeof EPIC_STATUSES)[number];
export type Label = ReturnType<typeof serializeLabel>;
export type Profile = ReturnType<typeof serializeProfile>;
export type Agent = ReturnType<typeof serializeAgent>;
export type ApiKey = ReturnType<typeof serializeApiKey>;
/** Only the create response has the full key. */
export type NewApiKey = ApiKey & { key: string };
