import { ATTACHMENT_BUCKET, attachmentPath, getAttachmentRow, SIGNED_URL_SECONDS } from "@/lib/api/attachments";
import { notFound } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";

type Params = { id: string };

/**
 * Redirects to a short-lived signed Storage URL for the image. Works with the session
 * cookie, so `<img src="/api/v1/attachments/:id">` loads in the app, and with an API key.
 * Callers without access, and images whose upload never finished, get a 404.
 */
export const GET = route<Params>(async ({ db, params }) => {
  const attachment = await getAttachmentRow(db, params.id);
  const { data, error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachmentPath(attachment), SIGNED_URL_SECONDS);
  if (error || !data) throw notFound("Attachment");

  return new Response(null, {
    status: 302,
    headers: {
      location: data.signedUrl,
      // Lets the browser reuse the redirect for a while, but never past the signed URL's life.
      "cache-control": `private, max-age=${SIGNED_URL_SECONDS - 60}`,
    },
  });
});
