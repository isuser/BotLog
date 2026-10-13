/** Calls the Botlog API from the browser with the session cookie. */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: { ...(json === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiRequestError(
      response.status,
      error.code ?? "internal",
      error.message ?? "Something went wrong.",
      error.details,
    );
  }
  return body as T;
}

/** Fetches every page of a list endpoint. */
export async function apiAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const query = `${separator}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page: { data: T[]; next_cursor: string | null } = await api(path + query);
    items.push(...page.data);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

export const isConflict = (error: unknown) => error instanceof ApiRequestError && error.status === 409;

/** A message for the user, listing which fields were invalid when the API says so. */
export function errorMessage(error: unknown): string {
  const details = error instanceof ApiRequestError ? error.details : undefined;
  if (details?.length) return details.map((d) => `${d.path}: ${d.message}`).join(". ");
  return error instanceof Error ? error.message : "Something went wrong.";
}
