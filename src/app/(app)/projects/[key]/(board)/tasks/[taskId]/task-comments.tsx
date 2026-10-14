"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ActorAvatar, actorName } from "@/components/actor-avatar";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, apiAll } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Comment } from "@/lib/client/types";

/** Comments, oldest first, with a box to add one. Refetched when the window regains focus. */
export function TaskComments({ taskId }: { taskId: string }) {
  const { data: comments, error, mutate } = useSWR(`/tasks/${taskId}/comments`, (path: string) =>
    apiAll<Comment>(path),
  );
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function post() {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const { data } = await api<{ data: Comment }>(`/tasks/${taskId}/comments`, {
        method: "POST",
        json: { body: trimmed },
      });
      await mutate((current) => [...(current ?? []), data], { revalidate: false });
      setBody("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPosting(false);
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
            <li key={comment.id} className="flex gap-3">
              {comment.author ? (
                <ActorAvatar actor={comment.author} className="mt-0.5" />
              ) : (
                <span className="bg-muted mt-0.5 size-6 shrink-0 rounded-full" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm">
                  <span className="font-medium">{comment.author ? actorName(comment.author) : "Unknown"}</span>
                  {comment.author?.type === "agent" && <span className="text-muted-foreground"> (agent)</span>}
                  <span className="text-muted-foreground">
                    {" · "}
                    <time dateTime={comment.created_at} title={fullDate(comment.created_at)}>
                      {timeAgo(comment.created_at)}
                    </time>
                  </span>
                </p>
                <Markdown>{comment.body}</Markdown>
              </div>
            </li>
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
        <Button type="submit" size="sm" className="self-end" disabled={posting || !body.trim()}>
          Comment
        </Button>
      </form>
    </section>
  );
}
