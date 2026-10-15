import { z } from "zod";
import { THEMES } from "./profile";

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export const TASK_TYPES = ["feature", "bug", "improvement"] as const;
export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export const EPIC_STATUSES = ["planned", "in_progress", "done", "canceled"] as const;

const taskStatus = z.enum(TASK_STATUSES);
const taskType = z.enum(TASK_TYPES);
const taskPriority = z.enum(TASK_PRIORITIES);
const version = z.number().int().positive();

/** `null` unassigns; otherwise a user or an agent, never both. */
const assignee = z
  .object({ type: z.enum(["user", "agent"]), id: z.uuid() })
  .strict()
  .nullable();

const taskFields = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000),
  type: taskType,
  priority: taskPriority,
  epic_id: z.uuid().nullable(),
  assignee,
  due_date: z.iso.date().nullable(),
  /** The task's labels, replacing the current ones. Each must belong to the task's project. */
  label_ids: z.array(z.uuid()).max(20),
};

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,3}$/, "2 to 4 letters or digits, starting with a letter"),
    description: z.string().max(10_000).optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(10_000).optional(),
    /** How many days a finished task stays on the board. */
    done_window_days: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

export const createTaskSchema = z
  .object({ ...taskFields, status: taskStatus })
  .partial()
  .required({ title: true })
  .strict();

export const updateTaskSchema = z
  .object({ ...taskFields })
  .partial()
  .extend({ version })
  .strict()
  .refine((body) => Object.keys(body).length > 1, "Send at least one field to change besides version.");

/**
 * Moves a task to a status and/or position. `after_id` is the task that should end up
 * directly above it, `before_id` the one directly below; with neither, it goes to the top.
 */
export const moveTaskSchema = z
  .object({
    status: taskStatus.optional(),
    after_id: z.string().min(1).optional(),
    before_id: z.string().min(1).optional(),
    version,
  })
  .strict();

export const createCommentSchema = z.object({ body: z.string().trim().min(1).max(20_000) }).strict();

export const taskListFilters = z.object({
  status: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(taskStatus))
    .optional(),
  type: taskType.optional(),
  priority: taskPriority.optional(),
  /** `me`, `none`, `user:<uuid>` or `agent:<uuid>`. */
  assignee: z
    .union([
      z.literal("me"),
      z.literal("none"),
      z.templateLiteral(["user:", z.uuid()]),
      z.templateLiteral(["agent:", z.uuid()]),
    ])
    .optional(),
  /** An epic id, or `none` for tasks without an epic. */
  epic_id: z.union([z.literal("none"), z.uuid()]).optional(),
  /** Only tasks with this label. */
  label: z.uuid().optional(),
  /** Text search: a short ID like BOT-42 (or just 42), or words in the title. */
  q: z.string().trim().min(1).max(200).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

const agentFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2_000),
  avatar: z.string().trim().max(500).nullable(),
};

export const createAgentSchema = z
  .object(agentFields)
  .partial()
  .required({ name: true })
  .strict();

export const updateAgentSchema = z
  .object(agentFields)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

export const agentListFilters = z.object({ archived: z.enum(["true", "false"]).optional() });

export const createApiKeySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export const apiKeyListFilters = z.object({ revoked: z.enum(["true", "false"]).optional() });

export const updateProfileSchema = z
  .object({ name: z.string().trim().max(100), theme: z.enum(THEMES) })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

const epicFields = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000),
  status: z.enum(EPIC_STATUSES),
  target_date: z.iso.date().nullable(),
};

export const createEpicSchema = z.object(epicFields).partial().required({ title: true }).strict();

export const updateEpicSchema = z
  .object(epicFields)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

export const epicListFilters = z.object({
  status: z.enum(EPIC_STATUSES).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

const labelFields = {
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "A hex colour like #84cc16"),
};

export const createLabelSchema = z.object(labelFields).partial().required({ name: true }).strict();

export const updateLabelSchema = z
  .object(labelFields)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");
