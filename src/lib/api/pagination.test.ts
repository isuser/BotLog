import { describe, expect, test } from "vitest";
import { decodeCursor, encodeCursor, keysetFilter, page, parseLimit } from "./pagination";

const params = (query: string) => new URLSearchParams(query);

describe("parseLimit", () => {
  test("defaults to 50 and accepts 1 to 100", () => {
    expect(parseLimit(params(""))).toBe(50);
    expect(parseLimit(params("limit=1"))).toBe(1);
    expect(parseLimit(params("limit=100"))).toBe(100);
  });

  test("rejects out of range or non-integers", () => {
    for (const limit of ["0", "101", "2.5", "abc", ""]) {
      expect(() => parseLimit(params(`limit=${limit}`))).toThrow(/limit/);
    }
  });
});

describe("cursors", () => {
  test("round-trip", () => {
    const cursor = encodeCursor(["todo", "a0V", "some-id"]);
    expect(decodeCursor(params(`cursor=${cursor}`), 3)).toEqual(["todo", "a0V", "some-id"]);
  });

  test("reject tampered or wrong-length cursors", () => {
    expect(() => decodeCursor(params("cursor=nope"), 3)).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(params(`cursor=${encodeCursor(["a"])}`), 3)).toThrow(/Invalid cursor/);
    expect(decodeCursor(params(""), 3)).toBeNull();
  });
});

describe("keysetFilter", () => {
  test("builds a lexicographic comparison", () => {
    expect(keysetFilter(["status", "position", "id"], ["todo", "a0", "x"])).toBe(
      'status.gt."todo",and(status.eq."todo",position.gt."a0"),and(status.eq."todo",position.eq."a0",id.gt."x")',
    );
  });

  test("quotes values so PostgREST punctuation stays literal", () => {
    expect(keysetFilter(["created_at"], ['2026-10-12T13:25:25.5+00:00,"x"'], "lt")).toBe(
      'created_at.lt."2026-10-12T13:25:25.5+00:00,\\"x\\""',
    );
  });
});

describe("page", () => {
  test("returns a cursor only when there are more rows", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(page(rows, 2, (r) => [r.id])).toEqual({ data: rows.slice(0, 2), next_cursor: encodeCursor([2]) });
    expect(page(rows, 3, (r) => [r.id])).toEqual({ data: rows, next_cursor: null });
  });
});
