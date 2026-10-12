import { z } from "zod";

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "done"] as const;
export const TASK_TYPES = ["feature", "bug", "improvement"] as const;
export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

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
  archived: z.enum(["true", "false"]).optional(),
});
