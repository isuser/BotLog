/** Shortest password Botlog accepts. Supabase's own minimum (6 by default) still applies on top. */
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores anything past 72 bytes

/** Why a new password can't be used, or null if it's fine. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) return "Use at most 72 characters.";
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

/** Email link types Botlog handles: an invite from the Supabase dashboard, or a password reset. */
export type EmailLinkType = "invite" | "recovery";

export function emailLinkType(raw: unknown): EmailLinkType | null {
  return raw === "invite" || raw === "recovery" ? raw : null;
}

// Sign-in methods (the token's `amr` claim) that come from an invite or reset email.
const EMAIL_LINK_METHODS = new Set(["invite", "recovery", "otp", "magiclink"]);
const EMAIL_LINK_WINDOW_SECONDS = 10 * 60;

/**
 * Whether this session signed in from an email link in the last 10 minutes. Only then can a
 * password be set without the current one; otherwise someone holding a stolen session could
 * lock the owner out.
 */
export function signedInByEmailLink(amr: unknown, nowSeconds = Date.now() / 1000): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some(
    (entry) =>
      EMAIL_LINK_METHODS.has(entry?.method) &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp <= EMAIL_LINK_WINDOW_SECONDS,
  );
}
