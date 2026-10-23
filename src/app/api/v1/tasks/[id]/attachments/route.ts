import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_SELECT,
  attachmentPath,
  serializeAttachment,
} from "@/lib/api/attachments";
import { ApiError, fromPostgrest } from "@/lib/api/errors";
import { json, parseBody, route } from "@/lib/api/handler";
import { createAttachmentSchema } from "@/lib/api/schemas";
import { getTaskRow } from "@/lib/api/tasks";
import type { TablesInsert } from "@/lib/supabase/database.types";

type Params = { id: string };
type AttachmentRow = Parameters<typeof serializeAttachment>[0];

/**
 * Starts an image upload: records the attachment and returns a signed URL the file is then
 * `PUT` to, straight to Storage (so it never passes through the app's request-size limit).
 * The URL is signed as the caller, so Storage's RLS applies, and the bucket checks the type
 * and size again.
 */
export const POST = route<Params>(async ({ db, request, params }) => {
  const fields = await parseBody(request, createAttachmentSchema);
  const task = await getTaskRow(db, params.id);

  const { data, error } = await db
    .from("attachment")
    // project_id and the uploader are set by a trigger.
    .insert({ task_id: task.id, ...fields } as TablesInsert<"attachment">)
    .select(ATTACHMENT_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const attachment = data as unknown as AttachmentRow;

  const { data: upload, error: uploadError } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(attachmentPath(attachment));
  if (uploadError) {
    console.error("Could not sign an attachment upload", uploadError);
    throw new ApiError("internal", "Could not start the upload.");
  }
  return json({ data: serializeAttachment(attachment), upload_url: upload.signedUrl }, 201);
});
