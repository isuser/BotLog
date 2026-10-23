"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ActorAvatar, actorName } from "@/components/actor-avatar";
import { AddImageButton, useImageUploads } from "@/components/image-uploads";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, apiAll } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Comment } from "@/lib/client/types";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * Comments, oldest first, with a box to add one. Authors can edit their own; people can delete
 * theirs and agents'. Refetched when the window regains focus.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const { data: comments, error, mutate } = useSWR(`/tasks/${taskId}/comments`, (path: string) =>
    apiAll<Comment>(path),
  );
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  const images = useImageUploads(taskId, setBody);

  async function post() {
    const trimmed = body.trim();
    if (!trimmed || posting || images.uploading) return;
    setPosting(true);
    try {
      const { data } = await api<{ data: Comment }>(`/tasks/${taskId}/comments`, {
        method: "POST",
        json: { body: trimmed },
      });
      await mutate((current) => [...(current ?? []), data], { revalidate: false });
      setBody("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function edit(comment: Comment, body: string) {
    try {
      const { data } = await api<{ data: Comment }>(`/comments/${comment.id}`, { method: "PATCH", json: { body } });
      await mutate((current) => current?.map((c) => (c.id === data.id ? data : c)), { revalidate: false });
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function remove(comment: Comment) {
    try {
      await api(`/comments/${comment.id}`, { method: "DELETE" });
      setDeleting(null);
      await mutate((current) => current?.filter((c) => c.id !== comment.id), { revalidate: false });
      toast("Comment deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="task-comments">
      <h3 id="task-comments" className="text-sm font-semibold">
        Comments
      </h3>

      {error ? (
        <p className="text-muted-foreground text-sm">Couldn&apos;t load comments: {error.message}</p>
      ) : !comments ? (
        <Skeleton className="h-16 w-full" />
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              taskId={taskId}
              onEdit={(body) => edit(comment, body)}
              onDelete={() => setDeleting(comment)}
            />
          ))}
        </ol>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
      >
        <Textarea
          {...images.textareaProps}
          aria-label="New comment"
          placeholder="Write a comment (Markdown supported)"
          value={body}
          maxLength={20_000}
          disabled={posting}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
          }}
          className="max-h-[40vh]"
        />
        <div className="flex items-center justify-end gap-2">
          <AddImageButton uploads={images} disabled={posting} />
          <Button type="submit" size="sm" disabled={posting || images.uploading || !body.trim()}>
            Comment
          </Button>
        </div>
      </form>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this comment?</DialogTitle>
            <DialogDescription>
              {deleting?.author?.type === "agent"
                ? `${actorName(deleting.author)}'s comment is removed for good. `
                : "It's removed for good. "}
              The task&apos;s activity records that a comment was deleted, not what it said.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={() => deleting && void remove(deleting)}>
              Delete comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** One comment: rendered, or edited in place with Save and Cancel. */
function CommentItem({
  comment,
  taskId,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  taskId: string;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const images = useImageUploads(taskId, (update) => setDraft((draft) => (draft === null ? draft : update(draft))));

  async function save() {
    if (draft === null || saving || images.uploading) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed === comment.body) return setDraft(null);
    setSaving(true);
    if (await onEdit(trimmed)) setDraft(null);
    setSaving(false);
  }

  const who = comment.author ? actorName(comment.author) : "Unknown";

  return (
    <li className="group flex gap-3">
      {comment.author ? (
        <ActorAvatar actor={comment.author} className="mt-0.5" />
      ) : (
        <span className="bg-muted mt-0.5 size-6 shrink-0 rounded-full" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{who}</span>
            {comment.author?.type === "agent" && <span className="text-muted-foreground"> (agent)</span>}
            <span className="text-muted-foreground">
              {" · "}
              <time dateTime={comment.created_at} title={fullDate(comment.created_at)}>
                {timeAgo(comment.created_at)}
              </time>
              {comment.edited_at && (
                <>
                  {" · "}
                  <time dateTime={comment.edited_at} title={`Edited ${fullDate(comment.edited_at)}`}>
                    edited
                  </time>
                </>
              )}
            </span>
          </p>
          {draft === null && (comment.can_edit || comment.can_delete) && (
            <div className="-my-1.5 flex shrink-0 gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
              {comment.can_edit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Edit comment"
                  onClick={() => setDraft(comment.body)}
                >
                  <PencilIcon />
                </Button>
              )}
              {comment.can_delete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={`Delete ${comment.author?.type === "agent" ? `${who}'s ` : ""}comment`}
                  onClick={onDelete}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          )}
        </div>

        {draft !== null ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Textarea
              {...images.textareaProps}
              aria-label="Edit comment"
              autoFocus
              value={draft}
              maxLength={20_000}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void save();
                } else if (e.key === "Escape") {
                  // Cancel the edit instead of closing the panel.
                  e.stopPropagation();
                  setDraft(null);
                }
              }}
              className="max-h-[40vh]"
            />
            <div className="flex items-center justify-end gap-2">
              <AddImageButton uploads={images} disabled={saving} />
              <span className="text-muted-foreground mr-auto hidden text-xs sm:inline">⌘/Ctrl + Enter to save</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || images.uploading || !draft.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <Markdown>{comment.body}</Markdown>
        )}
      </div>
    </li>
  );
}
