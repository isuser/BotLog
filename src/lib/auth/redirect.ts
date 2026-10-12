/** Where to go after sign-in: only same-site paths, so `?next=` can't send users elsewhere. */
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/sign-in")) return fallback;
  return next;
}
