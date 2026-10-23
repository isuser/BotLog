import { describe, expect, test, vi } from "vitest";

// The real admin client needs Supabase settings; every test passes a fake one.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { cleanUpAttachments } = await import("./attachment-cleanup");

type Orphan = { attachment_id: string | null; path: string };

/** A stand-in for the admin client: hands out `rounds` of orphans and records what's deleted. */
function fakeAdmin(rounds: Orphan[][], fail: { storage?: boolean } = {}) {
  const removed: string[][] = [];
  const deleted: string[][] = [];
  const admin = {
    rpc: vi.fn(async () => ({ data: rounds.shift() ?? [], error: null })),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          if (fail.storage) return { data: null, error: new Error("storage down") };
          removed.push(paths);
          return { data: [], error: null };
        },
      }),
    },
    from: () => ({
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          deleted.push(ids);
          return { error: null };
        },
      }),
    }),
  };
  return { admin: admin as unknown as Parameters<typeof cleanUpAttachments>[0], rpc: admin.rpc, removed, deleted };
}

const orphans = (n: number, withRow = true): Orphan[] =>
  Array.from({ length: n }, (_, i) => ({ attachment_id: withRow ? `id-${i}` : null, path: `p/${i}` }));

describe("cleanUpAttachments", () => {
  test("removes the files, then the rows of those that have one", async () => {
    const { admin, removed, deleted } = fakeAdmin([[...orphans(2), { attachment_id: null, path: "p/leftover" }]]);
    expect(await cleanUpAttachments(admin)).toEqual({ removed: 3 });
    expect(removed).toEqual([["p/0", "p/1", "p/leftover"]]);
    expect(deleted).toEqual([["id-0", "id-1"]]);
  });

  test("keeps going while full batches come back", async () => {
    const { admin, rpc } = fakeAdmin([orphans(200), orphans(200), orphans(5)]);
    expect(await cleanUpAttachments(admin)).toEqual({ removed: 405 });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  test("does nothing when there are no orphans", async () => {
    const { admin, removed } = fakeAdmin([]);
    expect(await cleanUpAttachments(admin)).toEqual({ removed: 0 });
    expect(removed).toEqual([]);
  });

  test("keeps the rows when Storage fails, so the next run tries again", async () => {
    const { admin, deleted } = fakeAdmin([orphans(2)], { storage: true });
    await expect(cleanUpAttachments(admin)).rejects.toThrow("storage down");
    expect(deleted).toEqual([]);
  });
});
