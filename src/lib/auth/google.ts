/**
 * Whether the "Continue with Google" button shows. Off unless GOOGLE_SIGN_IN=true, because
 * it only works once Google is set up in Supabase (see Self-hosting).
 */
export function googleSignInEnabled(raw: string | undefined = process.env.GOOGLE_SIGN_IN): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/** Sign-in page error codes, and what the page says for each. */
const SIGN_IN_ERRORS: Record<string, string> = {
  not_allowed: "This account doesn't have access to this Botlog instance.",
  no_account: "There's no Botlog account for that Google account. Ask whoever runs this Botlog to add you.",
  oauth: "Couldn't sign in with Google. Try again.",
};

/** The message for a sign-in page `?error=` code, or null for anything unknown. */
export function signInErrorMessage(code: string | null): string | null {
  return code && Object.hasOwn(SIGN_IN_ERRORS, code) ? SIGN_IN_ERRORS[code] : null;
}

/**
 * Turns the error Supabase sends back to the callback into a sign-in page error code. With
 * sign-ups off, a Google account with no Botlog user comes back as "Signups not allowed".
 */
export function oauthErrorCode(description: string | null): "no_account" | "oauth" {
  return description && /signups? not allowed/i.test(description) ? "no_account" : "oauth";
}
