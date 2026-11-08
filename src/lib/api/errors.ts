import type { PostgrestError } from "@supabase/supabase-js";
import { HANDLE_FORMAT_MESSAGE } from "@/lib/handle";

const STATUS = {
  bad_request: 400,
  invalid_reference: 400,
  archived: 400,
  ambiguous: 400,
  invite_expired: 410,
  invite_used: 410,
  invite_revoked: 410,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  already_exists: 409,
  handle_taken: 409,
  rate_limited: 429,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

/** An error the API answers with `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    /** Extra response headers, e.g. Retry-After on a 429. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound = (what: string) => new ApiError("not_found", `${what} not found.`);

/**
 * A project key or short ID that matches more than one project the caller can see (people
 * sharing projects can use the same key). Never pick one: say which full forms work.
 */
export const ambiguous = (ref: string, fullForms: string[]) =>
  new ApiError(
    "ambiguous",
    `${ref} matches ${fullForms.length} projects you can see. Use one of: ${fullForms.join(", ")}.`,
    { matches: fullForms },
  );

/** Handles are unique across the instance, ignoring case. */
export const handleTaken = () => new ApiError("handle_taken", "This handle is already taken. Pick another one.");

export const versionConflict = () =>
  new ApiError(
    "conflict",
    "This task was changed since you read it. Re-read the task and retry with its current version.",
  );

export function errorResponse(error: unknown): Response {
  const apiError = error instanceof ApiError ? error : null;
  if (!apiError) console.error("Unhandled API error", error);

  const body = apiError
    ? {
        error: {
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details === undefined ? {} : { details: apiError.details }),
        },
      }
    : { error: { code: "internal", message: "Something went wrong." } };

  return Response.json(body, {
    status: apiError?.status ?? 500,
    headers: { "cache-control": "no-store", ...apiError?.headers },
  });
}

/** Turns a database error into the matching API error. */
export function fromPostgrest(error: PostgrestError): ApiError {
  switch (error.code) {
    case "PGRST116":
      return new ApiError("not_found", "Not found.");
    case "23505":
      if (error.message.includes("workspace_handle_idx")) return handleTaken();
      return new ApiError("already_exists", alreadyExistsMessage(error));
    case "23503":
      return new ApiError("invalid_reference", referenceMessage(error));
    case "23514":
      if (error.message.includes("workspace_handle_not_reserved")) {
        return new ApiError("bad_request", "This handle is reserved. Pick another one.");
      }
      if (error.message.includes("workspace_handle_format")) return new ApiError("bad_request", HANDLE_FORMAT_MESSAGE);
      return new ApiError("bad_request", error.message);
    case "23502":
    case "22001":
    case "22007":
    case "22023":
    case "22P02":
      return new ApiError("bad_request", error.message);
    case "42501":
      // Messages raised by our own triggers are written for API users already.
      return new ApiError(
        "forbidden",
        error.message.startsWith("Only the project owner") ? error.message : "You don't have access to do this.",
      );
    // Raised by accept_project_invite.
    case "BLI01":
      return new ApiError("not_found", "This invite link doesn't exist.");
    case "BLI02":
      return new ApiError("invite_expired", "This invite link has expired. Ask for a new one.");
    case "BLI03":
      return new ApiError("invite_used", "This invite link has already been used. Ask for a new one.");
    case "BLI04":
      return new ApiError("invite_revoked", "This invite link was revoked. Ask for a new one.");
    case "BLI05":
      return new ApiError("already_exists", "You're already a member of this project.");
    default:
      console.error("Unexpected database error", error);
      return new ApiError("internal", "Something went wrong.");
  }
}

function alreadyExistsMessage(error: PostgrestError): string {
  if (error.message.includes("project_workspace_id_key_key")) {
    return "A project with this key already exists.";
  }
  if (error.message.includes("label_project_name_idx")) {
    return "A label with this name already exists in this project.";
  }
  if (error.message.includes("board_column_name_idx")) {
    return "A column with this name already exists in this project.";
  }
  return "This already exists.";
}

function referenceMessage(error: PostgrestError): string {
  // Messages raised by our own triggers are written for API users already.
  if (error.message.startsWith("assignee") || error.message.endsWith("not found")) {
    return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
  }
  if (error.message.includes("epic")) return "Epic not found in this project.";
  return "A referenced item doesn't exist.";
}
