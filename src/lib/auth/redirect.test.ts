import { expect, test } from "vitest";
import { safeRedirectPath } from "./redirect";

test("keeps same-site paths", () => {
  expect(safeRedirectPath("/projects/BOT?view=list")).toBe("/projects/BOT?view=list");
});

test("falls back for anything that could leave the site or loop", () => {
  for (const next of [undefined, null, 42, "", "https://evil.com", "//evil.com", "/\\evil.com", "evil", "/sign-in"]) {
    expect(safeRedirectPath(next)).toBe("/");
  }
});

test("falls back for paths a browser would turn into another site", () => {
  for (const next of ["/\t/evil.com", "/\n/evil.com", "/\r//evil.com", " //evil.com", "/ /evil.com", "/\u0000/evil.com", "/.//evil.com", "/..//evil.com", "/a/..//evil.com/", "/%2e%2e//evil.com", "/./sign-in"]) {
    expect(safeRedirectPath(next), JSON.stringify(next)).toBe("/");
  }
});
