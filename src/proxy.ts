import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { updateSession, withSessionCookies } from "@/lib/supabase/proxy";

const SIGN_IN = "/sign-in";
// Pages for people who aren't signed in yet: sign-in, and where Google sign-in comes back to.
const PUBLIC_PATHS = new Set([SIGN_IN, "/auth/callback"]);

/**
 * Keeps the Supabase session fresh and sends anyone who isn't signed in (or isn't on the
 * allowlist) to the sign-in page. This is only the first gate: the API checks every request
 * itself, and pages don't render project data on the server.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // API routes authenticate each request themselves (session cookie or agent API key)
  // and answer with JSON errors, never redirects.
  if (pathname.startsWith("/api/")) return response;

  const signedIn = Boolean(claims?.sub) && isEmailAllowed(claims?.email as string | undefined);
  const onSignIn = pathname === SIGN_IN;

  if (!signedIn && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN;
    url.search = "";
    if (claims?.sub) url.searchParams.set("error", "not_allowed");
    else if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  if (signedIn && onSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static files and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
