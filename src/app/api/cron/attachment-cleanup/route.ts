import { timingSafeEqual } from "node:crypto";
import { cleanUpAttachments } from "@/lib/api/attachment-cleanup";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { json } from "@/lib/api/handler";

const matches = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Deletes orphaned images. Vercel Cron calls it daily (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`; self-hosters schedule the same request. Off until
 * CRON_SECRET is set.
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new ApiError("not_found", "Set CRON_SECRET to enable the cleanup job.");
    if (!matches(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
      throw new ApiError("unauthorized", "Send CRON_SECRET as a Bearer token.");
    }
    return json({ data: await cleanUpAttachments() });
  } catch (error) {
    return errorResponse(error);
  }
}
