/** Where to go after sign-in: only same-site paths, so `?next=` can't send users elsewhere. */
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  // Browsers drop tabs and newlines from URLs, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f\s]/.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Resolve it the way a browser would ("/.//evil.com" becomes "//evil.com") and return that,
  // so what we checked is exactly what gets loaded.
  const base = "https://botlog.invalid";
  const url = new URL(next, base);
  if (url.origin !== base || url.pathname.startsWith("//") || url.pathname.startsWith("/sign-in")) return fallback;
  return url.pathname + url.search + url.hash;
}
