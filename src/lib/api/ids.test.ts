import { describe, expect, test } from "vitest";
import { ApiError } from "./errors";
import { escapeLike, parseProjectRef, parseTaskQuery, parseTaskRef } from "./ids";

const uuid = "0AF707C6-8459-4925-8506-9360AD1636BA";

describe("parseTaskRef", () => {
  test("accepts UUIDs and short IDs in any case", () => {
    expect(parseTaskRef(uuid)).toEqual({ id: uuid.toLowerCase() });
    expect(parseTaskRef("BOT-42")).toEqual({ key: "BOT", number: 42 });
    expect(parseTaskRef("bot-42")).toEqual({ key: "BOT", number: 42 });
    expect(parseTaskRef("BOT%2D7")).toEqual({ key: "BOT", number: 7 });
  });

  test("rejects anything else with a helpful 400", () => {
    for (const ref of ["BOT", "42", "BOT-", "B-1", "BOT-1-2", "../etc", "BOT-1234567890", "ABCDE-1"]) {
      expect(() => parseTaskRef(ref)).toThrow(ApiError);
    }
  });
});

describe("parseProjectRef", () => {
  test("accepts UUIDs and keys in any case", () => {
    expect(parseProjectRef(uuid)).toEqual({ id: uuid.toLowerCase() });
    expect(parseProjectRef("bot")).toEqual({ key: "BOT" });
  });

  test("rejects invalid keys", () => {
    for (const ref of ["B", "1BOT", "BOT-1", "ABCDE"]) {
      expect(() => parseProjectRef(ref)).toThrow(ApiError);
    }
  });
});

describe("parseTaskQuery", () => {
  test("reads short IDs in any case, and bare numbers", () => {
    expect(parseTaskQuery("bot-42")).toEqual({ key: "BOT", number: 42 });
    expect(parseTaskQuery(" 7 ")).toEqual({ number: 7 });
  });

  test("anything else is a title search", () => {
    expect(parseTaskQuery("login bug")).toBeNull();
    expect(parseTaskQuery("BOT")).toBeNull();
    expect(parseTaskQuery("BOT-")).toBeNull();
  });
});

describe("escapeLike", () => {
  test("never lets * act as PostgREST's match-anything wildcard", () => {
    expect(escapeLike("a*b")).toBe("a_b");
    expect(escapeLike("*")).toBe("_");
  });

  test("matches % and _ literally", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
});
