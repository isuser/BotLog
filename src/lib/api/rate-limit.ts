import type { Actor, Db } from "./auth";
import { ApiError } from "./errors";

const WINDOW_SECONDS = 60;

/** Requests per minute: per API key for agents, per person for the web app and scripts. */
export function rateLimitFor(actor: Actor): number {
  return actor.type === "agent"
    ? positiveInt(process.env.RATE_LIMIT_API_KEY_PER_MINUTE, 120)
    : positiveInt(process.env.RATE_LIMIT_USER_PER_MINUTE, 600);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Counts this request against the caller's allowance (in Postgres, see hit_rate_limit) and
 * throws a 429 with Retry-After once it's used up. If counting itself fails, the request goes
 * through: a broken limiter shouldn't take the API down.
 */
export async function enforceRateLimit(db: Db, actor: Actor): Promise<void> {
  const { data, error } = await db.rpc("hit_rate_limit", { p_window_seconds: WINDOW_SECONDS }).single();
  if (error || !data) {
    console.error("Rate limit check failed; allowing the request", error);
    return;
  }
  const limit = rateLimitFor(actor);
  if (data.hits <= limit) return;

  const retryAfter = Math.max(1, Math.ceil((new Date(data.reset_at).getTime() - Date.now()) / 1000));
  throw new ApiError(
    "rate_limited",
    `Too many requests: the limit is ${limit} a minute. Try again in ${retryAfter} seconds.`,
    { retry_after: retryAfter, limit },
    { "retry-after": String(retryAfter) },
  );
}
