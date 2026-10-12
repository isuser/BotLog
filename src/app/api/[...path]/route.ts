import { ApiError, errorResponse } from "@/lib/api/errors";

/** Unknown API paths answer with the standard JSON error instead of an HTML page. */
function notFound() {
  return errorResponse(new ApiError("not_found", "No such API endpoint."));
}

export { notFound as GET, notFound as POST, notFound as PATCH, notFound as PUT, notFound as DELETE };
