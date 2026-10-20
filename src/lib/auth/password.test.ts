import { expect, test } from "vitest";
import { emailLinkType, passwordProblem, signedInByEmailLink } from "./password";

test("accepts a long enough password that matches its confirmation", () => {
  expect(passwordProblem("correct horse", "correct horse")).toBeNull();
});

test("rejects short, overlong and mismatched passwords", () => {
  expect(passwordProblem("short", "short")).toMatch(/at least 8/);
  expect(passwordProblem("a".repeat(73), "a".repeat(73))).toMatch(/at most 72/);
  // 72 bytes is the limit, not 72 characters.
  expect(passwordProblem("é".repeat(40), "é".repeat(40))).toMatch(/at most 72/);
  expect(passwordProblem("correct horse", "correct house")).toMatch(/don't match/);
});

test("only invite and recovery links are handled", () => {
  expect(emailLinkType("invite")).toBe("invite");
  expect(emailLinkType("recovery")).toBe("recovery");
  for (const type of ["signup", "magiclink", "email_change", "", null, undefined, 1]) {
    expect(emailLinkType(type)).toBeNull();
  }
});

test("only a recent email-link sign-in lets you set a password without the current one", () => {
  const now = 1_800_000_000;
  expect(signedInByEmailLink([{ method: "recovery", timestamp: now - 60 }], now)).toBe(true);
  expect(signedInByEmailLink([{ method: "invite", timestamp: now - 600 }], now)).toBe(true);
  expect(signedInByEmailLink([{ method: "recovery", timestamp: now - 601 }], now)).toBe(false);
  expect(signedInByEmailLink([{ method: "password", timestamp: now }], now)).toBe(false);
  for (const amr of [undefined, null, "recovery", [null], [{ method: "recovery" }]]) {
    expect(signedInByEmailLink(amr, now)).toBe(false);
  }
});
