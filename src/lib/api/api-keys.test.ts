import { expect, test } from "vitest";
import { generateApiKey, hashApiKey, isApiKey } from "./api-keys";

test("keys are random, prefixed and stored only as a SHA-256 hash", () => {
  const a = generateApiKey();
  const b = generateApiKey();
  expect(a.key).not.toBe(b.key);
  expect(isApiKey(a.key)).toBe(true);
  expect(a.key.length).toBeGreaterThan(40);
  expect(a.prefix).toBe(a.key.slice(0, 10));
  expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(hashApiKey(a.key)).toBe(a.hash);
  expect(a.hash).not.toContain(a.key.slice(3));
});

test("Supabase access tokens are not mistaken for API keys", () => {
  expect(isApiKey("eyJhbGciOiJFUzI1NiJ9.e30.sig")).toBe(false);
});
