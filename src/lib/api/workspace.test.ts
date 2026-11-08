import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { handleFormatProblem } from "@/lib/handle";
import { fromPostgrest } from "./errors";
import { updateWorkspaceSchema } from "./schemas";

const pgError = (code: string, message: string) => ({ code, message, details: "", hint: "", name: "PostgrestError" }) as PostgrestError;

describe("updateWorkspaceSchema", () => {
  test("lowercases and trims the handle", () => {
    expect(updateWorkspaceSchema.parse({ handle: "  Ana-Team " })).toEqual({ handle: "ana-team" });
  });
  test("rejects handles the database would", () => {
    for (const bad of ["a", "-ab", "ab-", "a_b", "a b", "x".repeat(31), ""]) {
      expect(updateWorkspaceSchema.safeParse({ handle: bad }).success, bad).toBe(false);
      expect(handleFormatProblem(bad), bad).not.toBeNull();
    }
    expect(handleFormatProblem("ab")).toBeNull();
    expect(handleFormatProblem("x".repeat(30))).toBeNull();
  });
  test("takes only the handle", () => {
    expect(updateWorkspaceSchema.safeParse({ handle: "ana", name: "x" }).success).toBe(false);
  });
});

describe("handle errors from the database", () => {
  test("a taken handle is a 409 handle_taken", () => {
    const error = fromPostgrest(pgError("23505", 'duplicate key value violates unique constraint "workspace_handle_idx"'));
    expect([error.status, error.code]).toEqual([409, "handle_taken"]);
  });
  test("reserved and badly formed handles are a 400 with a readable message", () => {
    const reserved = fromPostgrest(pgError("23514", 'new row for relation "workspace" violates check constraint "workspace_handle_not_reserved"'));
    expect([reserved.status, reserved.message]).toEqual([400, "This handle is reserved. Pick another one."]);
    const format = fromPostgrest(pgError("23514", 'new row for relation "workspace" violates check constraint "workspace_handle_format"'));
    expect(format.status).toBe(400);
    expect(format.message).toMatch(/lowercase letters/);
  });
});
