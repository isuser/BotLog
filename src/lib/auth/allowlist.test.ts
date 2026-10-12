import { describe, expect, test } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  test("splits, trims and lowercases", () => {
    expect(parseAllowedEmails(" Ada@Example.com, bob@example.com ,,")).toEqual(
      new Set(["ada@example.com", "bob@example.com"]),
    );
  });

  test("empty or missing means no allowlist", () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
    expect(parseAllowedEmails("")).toBeNull();
    expect(parseAllowedEmails(" , ")).toBeNull();
  });
});

describe("isEmailAllowed", () => {
  const list = "ada@example.com";

  test("allows listed emails, ignoring case and spaces", () => {
    expect(isEmailAllowed("ada@example.com", list)).toBe(true);
    expect(isEmailAllowed(" ADA@example.com ", list)).toBe(true);
  });

  test("rejects everyone else", () => {
    expect(isEmailAllowed("eve@example.com", list)).toBe(false);
    expect(isEmailAllowed("ada@example.com.evil.com", list)).toBe(false);
  });

  test("rejects a missing email even without an allowlist", () => {
    expect(isEmailAllowed(undefined, "")).toBe(false);
    expect(isEmailAllowed("", "")).toBe(false);
  });

  test("allows anyone when there is no allowlist", () => {
    expect(isEmailAllowed("anyone@example.com", "")).toBe(true);
  });
});
