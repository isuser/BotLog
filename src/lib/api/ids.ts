import { ApiError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An optional workspace handle in front ("pedro/BOT", "pedro/BOT-42") picks one project when
// people sharing projects use the same key. The database checks the handle's exact format.
const HANDLE = "(?:([A-Za-z0-9-]{2,30})/)?";
const PROJECT_KEY = new RegExp(`^${HANDLE}([A-Za-z][A-Za-z0-9]{1,3})$`);
const SHORT_ID = new RegExp(`^${HANDLE}([A-Za-z][A-Za-z0-9]{1,3})-(\\d{1,9})$`);

export const isUuid = (value: string) => UUID.test(value);

/** `handle` is only there when the reference had one. */
export type TaskRef = { id: string } | { key: string; number: number; handle?: string };
export type ProjectRef = { id: string } | { key: string; handle?: string };

const withHandle = (handle: string | undefined) => (handle ? { handle: handle.toLowerCase() } : {});

/** A task id: a UUID or a short ID like BOT-42 or pedro/BOT-42 (case-insensitive). */
export function parseTaskRef(ref: string): TaskRef {
  const value = decodeURIComponent(ref).trim();
  if (isUuid(value)) return { id: value.toLowerCase() };
  const match = SHORT_ID.exec(value);
  if (match) return { key: match[2].toUpperCase(), number: Number(match[3]), ...withHandle(match[1]) };
  throw new ApiError("bad_request", `"${value}" is not a task ID. Use a UUID or a short ID like BOT-42.`);
}

/** A project id: a UUID or the project key like BOT or pedro/BOT (case-insensitive). */
export function parseProjectRef(ref: string): ProjectRef {
  const value = decodeURIComponent(ref).trim();
  if (isUuid(value)) return { id: value.toLowerCase() };
  const match = PROJECT_KEY.exec(value);
  if (match) return { key: match[2].toUpperCase(), ...withHandle(match[1]) };
  throw new ApiError("bad_request", `"${value}" is not a project ID. Use a UUID or a project key like BOT.`);
}

export const shortId = (key: string, number: number) => `${key}-${number}`;

/** A project key or short ID with its workspace handle in front: pedro/BOT, pedro/BOT-42. */
export const fullForm = (handle: string, ref: string) => `${handle}/${ref}`;

/** A search query read as a task reference: "BOT-42" or "pedro/BOT-42" (any case) or a bare number "42". */
export function parseTaskQuery(q: string): { key?: string; number: number; handle?: string } | null {
  const value = q.trim();
  const match = SHORT_ID.exec(value);
  if (match) return { key: match[2].toUpperCase(), number: Number(match[3]), ...withHandle(match[1]) };
  if (/^\d{1,9}$/.test(value)) return { number: Number(value) };
  return null;
}

/**
 * Escapes LIKE wildcards so user text is matched literally. PostgREST turns `*` into `%` and
 * has no escape for it, so `*` becomes `_` (any one character), the closest to a literal `*`.
 */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`).replaceAll("*", "_");
