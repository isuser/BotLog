import { describe, expect, test } from "vitest";
import { ApiError } from "./errors";
import { parseProjectRef, parseTaskRef } from "./ids";

const uuid = "0AF707C6-8459-4925-8506-9360AD1636BA";

describe("parseTaskRef", () => {
  test("accepts UUIDs and short IDs in any case", () => {
    expect(parseTaskRef(uuid)).toEqual({ id: uuid.toLowerCase() });
    expect(parseTaskRef("BOT-42")).toEqual({ key: "BOT", number: 42 });
    expect(parseTaskRef("bot-42")).toEqual({ key: "BOT", number: 42 });
    expect(parseTaskRef("BOT%2D7")).toEqual({ key: "BOT", number: 7 });
  });

  test("rejects anything else with a helpful 400", () => {
    for (const ref of ["BOT", "42", "BOT-", "B-1", "BOT-1-2", "../etc", "BOT-1234567890"]) {
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
    for (const ref of ["B", "1BOT", "BOT-1", "TOOLONGKEY1"]) {
      expect(() => parseProjectRef(ref)).toThrow(ApiError);
    }
  });
});
