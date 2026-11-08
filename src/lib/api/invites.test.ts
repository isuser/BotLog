import { describe, expect, test } from "vitest";
import { generateInviteToken, hashInviteToken, inviteExpiresAt, isInviteToken } from "./invites";

describe("invite tokens", () => {
  test("are 256 random bits the database accepts, stored only as their hash", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(isInviteToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashInviteToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("anything else isn't a token", () => {
    for (const value of ["", "short", "x".repeat(129), "has space".padEnd(40, "x"), "../".repeat(20)]) {
      expect(isInviteToken(value)).toBe(false);
    }
  });
});

describe("inviteExpiresAt", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");

  test("1 hour and 24 hours are exact", () => {
    expect(inviteExpiresAt("1h", now)).toBe("2026-11-08T13:00:00.000Z");
    expect(inviteExpiresAt("24h", now)).toBe("2026-11-09T12:00:00.000Z");
  });

  test("7 days ends a minute early, so it stays under the database's cap", () => {
    expect(inviteExpiresAt("7d", now)).toBe("2026-11-15T11:59:00.000Z");
  });
});
