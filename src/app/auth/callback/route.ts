import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { googleSignInEnabled, oauthErrorCode } from "@/lib/auth/google";
import { NEXT_COOKIE, safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase sends the browser back after "Continue with Google": swaps the one-time code
 * for a session (the PKCE verifier cookie was set when sign-in started), then checks the
 * allowlist like the password sign-in does.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const toSignIn = (error: string) => redirectTo(request, `/sign-in?error=${error}`);
  // GOOGLE_SIGN_IN=false turns Google off here too, not just the button.
  if (!googleSignInEnabled()) return toSignIn("oauth");

  const code = searchParams.get("code");
  if (!code) return toSignIn(oauthErrorCode(searchParams.get("error_description")));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Google sign-in failed", error?.status, error?.code);
    return toSignIn("oauth");
  }

  if (!isEmailAllowed(data.user.email)) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error("Signing out a user not on the allowlist failed", signOutError.status);
    return toSignIn("not_allowed");
  }

  // Back to where sign-in started (an invite link, say), checked again like ?next= is.
  const response = redirectTo(request, safeRedirectPath(request.cookies.get(NEXT_COOKIE)?.value));
  response.cookies.delete({ name: NEXT_COOKIE, path: "/auth/callback" });
  return response;
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
