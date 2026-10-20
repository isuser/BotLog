import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "./errors";

const enforceRateLimit = vi.fn();
vi.mock("./auth", () => ({ authenticate: async () => ({ actor: { type: "user" }, db: {} }) }));
vi.mock("./rate-limit", () => ({ enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args) }));

const { json, route } = await import("./handler");

afterEach(() => vi.resetAllMocks());

const call = (method: string, handler: () => Promise<Response>) =>
  route(handler)(new NextRequest("https://botlog.example.com/api/v1/things", { method }), {
    params: Promise.resolve({}),
  });

const overLimit = () => Promise.reject(new ApiError("rate_limited", "Too many requests."));

/** A promise you resolve later, to see what has started before anything finishes. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

test("reads count the limit and run the handler at the same time", async () => {
  const limit = gate();
  enforceRateLimit.mockReturnValue(limit.promise);
  const handler = vi.fn(async () => json({ data: 1 }));

  const response = call("GET", handler);
  await vi.waitFor(() => expect(handler).toHaveBeenCalled());
  limit.open();
  expect((await response).status).toBe(200);
});

test("a read over the limit is still a 429, even when the handler succeeded", async () => {
  enforceRateLimit.mockImplementation(overLimit);
  const response = await call("GET", async () => json({ data: 1 }));
  expect(response.status).toBe(429);
});

test("a read's own error comes through when it's under the limit", async () => {
  enforceRateLimit.mockResolvedValue(undefined);
  const response = await call("GET", async () => {
    throw new ApiError("not_found", "Task not found.");
  });
  expect(response.status).toBe(404);
});

test("writes count the limit first and never run over it", async () => {
  enforceRateLimit.mockImplementation(overLimit);
  const handler = vi.fn(async () => json({ data: 1 }));
  for (const method of ["POST", "PATCH", "DELETE"]) {
    expect((await call(method, handler)).status).toBe(429);
  }
  expect(handler).not.toHaveBeenCalled();

  const limit = gate();
  enforceRateLimit.mockReturnValue(limit.promise);
  const response = call("POST", handler);
  await Promise.resolve();
  expect(handler).not.toHaveBeenCalled();
  limit.open();
  expect((await response).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});
