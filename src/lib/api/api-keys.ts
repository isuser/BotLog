import { createHash, randomBytes } from "node:crypto";

const PREFIX = "bl_";

export const isApiKey = (token: string) => token.startsWith(PREFIX);

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new agent API key. Only `hash` and `prefix` are stored; `key` is shown once. */
export function generateApiKey() {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}
