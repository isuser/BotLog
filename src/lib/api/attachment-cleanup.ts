import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET } from "./attachments";

/** Orphans handled per round; their ids go in a URL, so keep it modest. */
const BATCH = 200;
const MAX_ROUNDS = 50;

/**
 * Deletes images no description or comment links to any more (and over a day old), plus
 * files left without an attachment row. An admin task, so it uses the secret key: files go
 * through Storage first, then the rows, so a failure part-way leaves a file the next run
 * still finds.
 */
export async function cleanUpAttachments(admin = createAdminClient()) {
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: orphans, error } = await admin.rpc("attachment_orphans", { max_rows: BATCH });
    if (error) throw error;
    if (orphans.length === 0) break;

    const { error: storageError } = await admin.storage.from(ATTACHMENT_BUCKET).remove(orphans.map((o) => o.path));
    if (storageError) throw storageError;

    const ids = orphans.flatMap((o) => (o.attachment_id ? [o.attachment_id] : []));
    if (ids.length) {
      const { error: deleteError } = await admin.from("attachment").delete().in("id", ids);
      if (deleteError) throw deleteError;
    }
    removed += orphans.length;
    if (orphans.length < BATCH) break;
  }
  return { removed };
}
