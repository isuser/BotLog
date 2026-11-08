import type { Project, Task } from "./types";

/**
 * Project keys are unique per workspace only, so someone in shared projects can see two
 * projects keyed BOT. For them the app shows and links the full form (`ana/BOT`, `ana/BOT-42`);
 * everyone else sees bare keys. In URLs the full form is one path segment (`ana%2FBOT`), which
 * the API accepts as is, so a page can use the same segment for its links and API calls.
 */

/** The keys the viewer sees on more than one project. */
export function clashingKeys(projects: readonly Pick<Project, "key">[]): Set<string> {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  for (const { key } of projects) (seen.has(key) ? clashes : seen).add(key);
  return clashes;
}

/** A project's key as shown: `BOT`, or `ana/BOT` when `full`. */
export const projectLabel = (project: Pick<Project, "key" | "full_key">, full: boolean) =>
  full ? project.full_key : project.key;

/** A task's ID as shown and copied: `BOT-42`, or `ana/BOT-42` when `full`. */
export const taskLabel = (task: Pick<Task, "short_id" | "full_id">, full: boolean) => (full ? task.full_id : task.short_id);

/** A project's URL segment, also usable in API paths: `BOT`, or `ana%2FBOT` when `full`. */
export const projectSegment = (project: Pick<Project, "key" | "full_key">, full: boolean) =>
  full ? toSegment(project.full_key) : project.key;

/** A project's page, in the full form if the viewer sees another project with its key. */
export const projectHref = (project: Pick<Project, "key" | "full_key">, projects: readonly Pick<Project, "key">[]) =>
  `/projects/${projectSegment(project, clashingKeys(projects).has(project.key))}`;

/** A reference as one URL path segment: `ana/BOT` → `ana%2FBOT`; bare keys stay as they are. */
export const toSegment = (ref: string) => encodeURIComponent(ref);

const decode = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * A project or task segment from the URL in one canonical form: key uppercase, handle
 * lowercase, encoded (`ANA%2fbot` → `ana%2FBOT`). Next.js may hand params over decoded or not.
 */
export function normalizeSegment(segment: string): string {
  const value = decode(segment).trim();
  const slash = value.indexOf("/");
  if (slash === -1) return toSegment(value.toUpperCase());
  return toSegment(`${value.slice(0, slash).toLowerCase()}/${value.slice(slash + 1).toUpperCase()}`);
}

/** A URL segment as shown: `ana%2FBOT` → `ana/BOT`. */
export const segmentLabel = (segment: string) => decode(normalizeSegment(segment));

/** Whether a project or task segment is in the full form. */
export const isFullSegment = (segment: string) => segmentLabel(segment).includes("/");

/** The project part of a task's full ID: `ana/BOT-42` → `ana/BOT`. */
const fullKeyOf = (task: Pick<Task, "full_id">) => task.full_id.slice(0, task.full_id.lastIndexOf("-"));

/** The segment for a task's project, in links and API paths (`BOT` or `ana%2FBOT`). */
export const taskProjectSegment = (task: Pick<Task, "project_key" | "full_id">, full: boolean) =>
  full ? toSegment(fullKeyOf(task)) : task.project_key;

/** The segment for a task in links (`BOT-42` or `ana%2FBOT-42`). */
export const taskSegment = (task: Pick<Task, "short_id" | "full_id">, full: boolean) =>
  full ? toSegment(task.full_id) : task.short_id;

/** Whether a task URL segment (short ID, full ID or UUID, any case) points at `task`. */
export function isTaskSegment(segment: string | undefined, task: Pick<Task, "id" | "short_id" | "full_id">): boolean {
  if (!segment) return false;
  const label = segmentLabel(segment);
  return label === task.short_id || label === task.full_id || label === task.id.toUpperCase();
}
