import { ApiError } from "./errors";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export function parseLimit(params: URLSearchParams): number {
  const raw = params.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError("bad_request", `limit must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
}

/** Cursors are the sort values of the last row returned, as opaque base64url JSON. */
export function encodeCursor(values: (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

export function decodeCursor(params: URLSearchParams, length: number): string[] | null {
  const raw = params.get("cursor");
  if (!raw) return null;
  try {
    const values: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      Array.isArray(values) &&
      values.length === length &&
      values.every((v) => typeof v === "string" || typeof v === "number")
    ) {
      return values.map(String);
    }
  } catch {
    // Fall through to the error below.
  }
  throw new ApiError("bad_request", "Invalid cursor.");
}

/**
 * A PostgREST `or` filter for rows that sort after (`gt`) or before (`lt`) the cursor
 * row, ordering by `columns` in turn: (a > x) or (a = x and b > y) or ...
 */
export function keysetFilter(columns: string[], values: string[], op: "gt" | "lt" = "gt"): string {
  const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const branches = columns.map((column, i) => {
    const equal = columns.slice(0, i).map((c, j) => `${c}.eq.${quote(values[j])}`);
    const conditions = [...equal, `${column}.${op}.${quote(values[i])}`];
    return conditions.length === 1 ? conditions[0] : `and(${conditions.join(",")})`;
  });
  return branches.join(",");
}

/** Splits a limit+1 fetch into the page and the cursor for the next one. */
export function page<T>(rows: T[], limit: number, cursorOf: (row: T) => (string | number)[]) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    next_cursor: hasMore ? encodeCursor(cursorOf(data[data.length - 1])) : null,
  };
}
