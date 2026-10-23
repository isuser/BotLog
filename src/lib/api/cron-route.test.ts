import { afterEach, expect, test, vi } from "vitest";

// The endpoint only needs the cleanup; keep the real clients (and their settings) out.
vi.mock("./attachment-cleanup", () => ({ cleanUpAttachments: async () => ({ removed: 7 }) }));
vi.mock("./auth", () => ({}));
vi.mock("./rate-limit", () => ({}));

const { GET } = await import("@/app/api/cron/attachment-cleanup/route");

afterEach(() => vi.unstubAllEnvs());

const run = async (authorization?: string) => {
  const response = await GET(
    new Request("https://botlog.example.com/api/cron/attachment-cleanup", {
      headers: authorization ? { authorization } : {},
    }),
  );
  return { status: response.status, body: await response.json() };
};

test("the attachment cleanup is off until CRON_SECRET is set", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await run("Bearer anything")).status).toBe(404);
});

test("the attachment cleanup needs CRON_SECRET as a Bearer token", async () => {
  vi.stubEnv("CRON_SECRET", "s3cret-value");
  expect((await run()).status).toBe(401);
  expect((await run("Bearer wrong")).status).toBe(401);
  expect(await run("Bearer s3cret-value")).toEqual({ status: 200, body: { data: { removed: 7 } } });
});
