/**
 * Workspace handles: the `ana` in `ana/BOT` and `ana/BOT-42`. Unique across the instance
 * (ignoring case). The database checks the same format and a short list of reserved names.
 */
export const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
export const HANDLE_MAX = 30;

export const HANDLE_FORMAT_MESSAGE =
  "Use 2 to 30 lowercase letters, digits or dashes, starting and ending with a letter or digit.";

/** Handles are stored lowercase; people can type them in any case. */
export const normalizeHandle = (value: string) => value.trim().toLowerCase();

/** What's wrong with a handle's format, or null if it's fine. Reserved names and clashes are for the server to say. */
export function handleFormatProblem(value: string): string | null {
  return HANDLE_REGEX.test(normalizeHandle(value)) ? null : HANDLE_FORMAT_MESSAGE;
}
