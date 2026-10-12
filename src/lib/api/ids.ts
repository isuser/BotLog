import { ApiError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9]{1,3}$/;
const SHORT_ID = /^([A-Za-z][A-Za-z0-9]{1,3})-(\d{1,9})$/;

export const isUuid = (value: string) => UUID.test(value);

export type TaskRef = { id: string } | { key: string; number: number };
export type ProjectRef = { id: string } | { key: string };

/** A task id: a UUID or a short ID like BOT-42 (case-insensitive). */
export function parseTaskRef(ref: string): TaskRef {
  const value = decodeURIComponent(ref).trim();
  if (isUuid(value)) return { id: value.toLowerCase() };
  const match = SHORT_ID.exec(value);
  if (match) return { key: match[1].toUpperCase(), number: Number(match[2]) };
  throw new ApiError("bad_request", `"${value}" is not a task ID. Use a UUID or a short ID like BOT-42.`);
}

/** A project id: a UUID or the project key like BOT (case-insensitive). */
export function parseProjectRef(ref: string): ProjectRef {
  const value = decodeURIComponent(ref).trim();
  if (isUuid(value)) return { id: value.toLowerCase() };
  if (PROJECT_KEY.test(value)) return { key: value.toUpperCase() };
  throw new ApiError("bad_request", `"${value}" is not a project ID. Use a UUID or a project key like BOT.`);
}

export const shortId = (key: string, number: number) => `${key}-${number}`;
