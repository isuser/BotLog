import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = join(import.meta.dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

/** Fresh in-memory Postgres with the Supabase stub and every migration applied in order. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(import.meta.dirname, "supabase-stub.sql"), "utf8"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Creates an auth user (as Supabase Auth would) and returns its id. */
export async function createUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

export type Claims = { sub: string; agent_id?: string; api_key_id?: string };

/**
 * Runs `fn` as the `authenticated` role with the given JWT claims, inside a transaction
 * that rolls back on error.
 */
export async function as<T>(
  db: PGlite,
  claims: Claims,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "authenticated", ...claims }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

/** Returns the single row of a query, failing if there isn't exactly one. */
export async function one<T>(
  tx: Transaction | PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await tx.query<T>(sql, params);
  if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}`);
  return rows[0];
}
