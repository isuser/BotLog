import { expect, test } from "vitest";
import { suggestKey } from "./project-key";

test("suggests short keys from names", () => {
  expect(suggestKey("Botlog")).toBe("BOT");
  expect(suggestKey("Mobile app")).toBe("MA");
  expect(suggestKey("Customer support knowledge base revamp")).toBe("CSKB");
  expect(suggestKey("2026 roadmap planning")).toBe("RP");
  expect(suggestKey("web-2 site")).toBe("W2S");
});

test("returns nothing when no valid key can be made", () => {
  expect(suggestKey("")).toBe("");
  expect(suggestKey("A")).toBe("");
  expect(suggestKey("123")).toBe("");
  expect(suggestKey("éé")).toBe("");
});
