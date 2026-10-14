import { describe, expect, test } from "vitest";
import { epicColor, LABEL_COLORS } from "./task-labels";

describe("epicColor", () => {
  test("is stable for an epic and always from the palette", () => {
    const id = "6f1c2b9e-3d4a-4f5b-8c7d-1e2f3a4b5c6d";
    expect(epicColor(id)).toBe(epicColor(id));
    expect(LABEL_COLORS).toContain(epicColor(id));
  });

  test("spreads different epics across the palette", () => {
    const colors = new Set(Array.from({ length: 40 }, (_, i) => epicColor(`epic-${i}`)));
    expect(colors.size).toBeGreaterThan(4);
  });
});
