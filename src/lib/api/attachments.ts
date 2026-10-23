import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "./auth";
import { ApiError, fromPostgrest, notFound } from "./errors";
import { isUuid } from "./ids";

/** The private Storage bucket images live in, at `<project_id>/<attachment_id>`. */
export const ATTACHMENT_BUCKET = "attachments";

/**
 * What the bucket takes (the migration sets the same limits). The web app converts images
 * to JPEG and compresses them to fit; GIFs are kept as they are so animations survive.
 */
export const ATTACHMENT_TYPES = ["image/jpeg", "image/gif"] as const;
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** How long the signed Storage URL behind `GET /attachments/:id` lasts. */
export const SIGNED_URL_SECONDS = 300;

export const ATTACHMENT_SELECT = `
  id, project_id, task_id, file_name, content_type, size, created_at,
  uploader_user:profile!attachment_uploader_user_id_fkey(id, name, email),
  uploader_agent:agent!attachment_uploader_agent_id_fkey(id, name, avatar)
`;

type AttachmentRow = Pick<
  Database["public"]["Tables"]["attachment"]["Row"],
  "id" | "project_id" | "task_id" | "file_name" | "content_type" | "size" | "created_at"
> & {
  uploader_user: { id: string; name: string; email: string } | null;
  uploader_agent: { id: string; name: string; avatar: string | null } | null;
};

export const attachmentPath = (row: Pick<AttachmentRow, "project_id" | "id">) => `${row.project_id}/${row.id}`;

/** The app's own link to an image. Markdown only ever holds this, never a Storage URL. */
export const attachmentUrl = (id: string) => `/api/v1/attachments/${id}`;

/** Markdown image syntax for an attachment, with characters that would break it removed from the alt text. */
export function attachmentMarkdown(row: Pick<AttachmentRow, "id" | "file_name">) {
  const alt = row.file_name.replace(/[[\]\\\r\n]/g, "").trim() || "image";
  return `![${alt}](${attachmentUrl(row.id)})`;
}

export function serializeAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    task_id: row.task_id,
    file_name: row.file_name,
    content_type: row.content_type,
    size: row.size,
    url: attachmentUrl(row.id),
    markdown: attachmentMarkdown(row),
    uploader: row.uploader_user
      ? { type: "user" as const, ...row.uploader_user }
      : row.uploader_agent
        ? { type: "agent" as const, ...row.uploader_agent }
        : null,
    created_at: row.created_at,
  };
}

/** An attachment the caller can see; anything else, including another workspace's, is a 404. */
export async function getAttachmentRow(db: Db, id: string): Promise<AttachmentRow> {
  if (!isUuid(id)) throw new ApiError("bad_request", `"${id}" is not an attachment ID.`);
  const { data, error } = await db
    .from("attachment")
    .select(ATTACHMENT_SELECT)
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw notFound("Attachment");
  return data as unknown as AttachmentRow;
}
