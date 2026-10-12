import { describe, expect, test } from "vitest";
import { timeAgo } from "./format";

describe("timeAgo", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  test("rounds down to the largest whole unit", () => {
    expect(timeAgo(ago(10), now)).toBe("just now");
    expect(timeAgo(ago(60), now)).toBe("1 minute ago");
    expect(timeAgo(ago(5 * 60 + 59), now)).toBe("5 minutes ago");
    expect(timeAgo(ago(3 * 3600), now)).toBe("3 hours ago");
    expect(timeAgo(ago(26 * 3600), now)).toBe("yesterday");
    expect(timeAgo(ago(15 * 24 * 3600), now)).toBe("2 weeks ago");
    expect(timeAgo(ago(400 * 24 * 3600), now)).toBe("last year");
  });

  test("treats small clock skew into the future as now", () => {
    expect(timeAgo(ago(-20), now)).toBe("just now");
  });
});
