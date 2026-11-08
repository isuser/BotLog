import type { serializeActivity } from "@/lib/api/activity";
import type { serializeAgent, serializeApiKey } from "@/lib/api/agents";
import type { serializeAttachment } from "@/lib/api/attachments";
import type { serializeColumn } from "@/lib/api/columns";
import type { serializeComment } from "@/lib/api/comments";
import type { serializeEpic } from "@/lib/api/epics";
import type { serializeInvite, serializeInvitePreview } from "@/lib/api/invites";
import type { serializeLabel } from "@/lib/api/labels";
import type { serializeMember } from "@/lib/api/members";
import type { serializeProfile } from "@/lib/api/profile";
import type { serializeProject } from "@/lib/api/projects";
import type { EPIC_STATUSES, TASK_STATUSES } from "@/lib/api/schemas";
import type { serializeTask } from "@/lib/api/tasks";
import type { serializeWorkspace } from "@/lib/api/workspace";

// The shapes the API returns, taken from its serializers so client and server can't drift.
export type Project = ReturnType<typeof serializeProject>;
export type Task = ReturnType<typeof serializeTask>;
/** A project's board column (Backlog, To do, a custom one…). */
export type BoardColumn = ReturnType<typeof serializeColumn>;
export type Activity = ReturnType<typeof serializeActivity>;
export type Comment = ReturnType<typeof serializeComment>;
/** An uploaded image; `markdown` is what goes in a description or comment. */
export type Attachment = ReturnType<typeof serializeAttachment>;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Epic = ReturnType<typeof serializeEpic>;
export type EpicStatus = (typeof EPIC_STATUSES)[number];
export type Label = ReturnType<typeof serializeLabel>;
export type Profile = ReturnType<typeof serializeProfile>;
/** The caller's own workspace; its handle is the `ana` in `ana/BOT-42`. */
export type Workspace = ReturnType<typeof serializeWorkspace>;
export type Agent = ReturnType<typeof serializeAgent>;
export type ApiKey = ReturnType<typeof serializeApiKey>;
/** Someone in a project, with their role there. */
export type Member = ReturnType<typeof serializeMember>;
export type Invite = ReturnType<typeof serializeInvite>;
/** Only the create response has the token and the link with it. */
export type NewInvite = Invite & { token: string; url: string };
/** What the join page shows for an invite link. */
export type InvitePreview = ReturnType<typeof serializeInvitePreview>;
/** Only the create response has the full key. */
export type NewApiKey = ApiKey & { key: string };
