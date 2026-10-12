/**
 * Email allowlist from ALLOWED_EMAILS (comma-separated).
 *
 * An empty or missing list means no allowlist: anyone with an account may sign in. That is
 * the "public instance" setup; a private instance also disables sign-up in Supabase Auth.
 */
export function parseAllowedEmails(raw: string | undefined): Set<string> | null {
  const emails = (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return emails.length > 0 ? new Set(emails) : null;
}

export function isEmailAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.ALLOWED_EMAILS,
): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails(raw);
  return allowed === null || allowed.has(email.trim().toLowerCase());
}
