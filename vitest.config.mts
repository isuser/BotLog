import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/** .env.local for the API tests; they talk to that Supabase project. */
function localEnv(): Record<string, string> {
  const path = fileURLToPath(new URL("./.env.local", import.meta.url));
  return existsSync(path) ? (parseEnv(readFileSync(path, "utf8")) as Record<string, string>) : {};
}

const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
  },
};

export default defineConfig({
  resolve,
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve,
        test: { name: "unit", include: ["src/**/*.test.ts", "tests/db/**/*.test.ts"] },
      },
      {
        // Runs against the Supabase project in .env.local: `pnpm test:api`.
        resolve,
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          env: localEnv(),
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
