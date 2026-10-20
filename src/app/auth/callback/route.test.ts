import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = { exchangeCodeForSession: vi.fn(), signOut: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { GET } = await import("./route");

const callback = (query: string) => GET(new NextRequest(`https://botlog.example.com/auth/callback${query}`));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  vi.stubEnv("GOOGLE_SIGN_IN", "true");
  vi.stubEnv("ALLOWED_EMAILS", "ada@example.com");
  auth.signOut.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const exchangeFor = (email: string) =>
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { email } }, error: null });

test("signs in an allowed user and goes home", async () => {
  exchangeFor("ada@example.com");
  const res = await callback("?code=abc");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  expect(location(res)).toBe("https://botlog.example.com/");
  expect(auth.signOut).not.toHaveBeenCalled();
});

test("signs out a user who isn't on the allowlist", async () => {
  exchangeFor("mallory@example.com");
  const res = await callback("?code=abc");
  expect(auth.signOut).toHaveBeenCalled();
  expect(location(res)).toBe("https://botlog.example.com/sign-in?error=not_allowed");
});

test("explains a Google account without a Botlog user, and hides other errors", async () => {
  expect(location(await callback("?error=access_denied&error_description=Signups+not+allowed+for+this+instance"))).toBe(
    "https://botlog.example.com/sign-in?error=no_account",
  );
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { status: 400 } });
  expect(location(await callback("?code=bad"))).toBe("https://botlog.example.com/sign-in?error=oauth");
});

test("does nothing when Google sign-in is off", async () => {
  vi.stubEnv("GOOGLE_SIGN_IN", "false");
  exchangeFor("ada@example.com");
  const res = await callback("?code=abc");
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(location(res)).toBe("https://botlog.example.com/sign-in?error=oauth");
});
