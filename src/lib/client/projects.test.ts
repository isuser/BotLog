import { describe, expect, test } from "vitest";
import { isShared } from "./projects";

describe("isShared", () => {
  test("admins and members are in someone else's project", () => {
    expect(isShared({ role: "admin" })).toBe(true);
    expect(isShared({ role: "member" })).toBe(true);
  });

  test("owned projects, and ones with no members yet, are the caller's own", () => {
    expect(isShared({ role: "owner" })).toBe(false);
    expect(isShared({ role: null })).toBe(false);
  });
});
