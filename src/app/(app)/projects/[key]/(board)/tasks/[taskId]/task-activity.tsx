"use client";

import { useEffect } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ActorAvatar, type Actor } from "@/components/actor-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeActivity, nameLookup } from "@/lib/client/activity";
import { api, apiAll } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Activity, Agent, BoardColumn, Epic, Label, Task } from "@/lib/client/types";
import type { CurrentUser } from "./task-fields";

/** Shown when a task opens; each "Load more" fetches the next few older entries. */
const FIRST_PAGE = 5;
const MORE = 10;

type ActivityPage = { data: Activity[]; next_cursor: string | null };

function entryActor({ actor }: Activity): Actor | null {
  if (actor.type === "ai" && actor.agent_id) {
    return { type: "agent", id: actor.agent_id, name: actor.name ?? "", avatar: null };
  }
  if (actor.type === "human" && actor.user_id) return { type: "user", id: actor.user_id, name: actor.name ?? "", email: "" };
  return null;
}

function actorLabel({ actor }: Activity) {
  if (actor.type === "system") return "Botlog";
  return actor.name || (actor.type === "ai" ? "An agent" : "Someone");
}

/**
 * The task's latest changes, oldest first, with older ones loaded a page at a time on request.
 * Refetched whenever the task changes.
 */
export function TaskActivity({ task, currentUser }: { task: Task; currentUser: CurrentUser }) {
  const { data, error, mutate, size, setSize, isValidating } = useSWRInfinite(
    (index, previous: ActivityPage | null) => {
      if (index === 0) return `/tasks/${task.id}/activity?limit=${FIRST_PAGE}`;
      if (!previous?.next_cursor) return null;
      return `/tasks/${task.id}/activity?limit=${MORE}&cursor=${encodeURIComponent(previous.next_cursor)}`;
    },
    (path: string) => api<ActivityPage>(path),
  );
  const { data: agents } = useSWR("/agents", (path: string) => apiAll<Agent>(path));
  // Shared with the Epic and Labels fields, so these are usually cached already.
  const { data: labels } = useSWR(`/projects/${task.project_key}/labels`, (path: string) => apiAll<Label>(path));
  const { data: epics } = useSWR(`/projects/${task.project_key}/epics`, (path: string) => apiAll<Epic>(path));
  const { data: columns } = useSWR(`/projects/${task.project_key}/columns`, (path: string) =>
    apiAll<BoardColumn>(path),
  );

  // Every change bumps the version, including ones made by agents and picked up on refocus.
  useEffect(() => {
    void mutate();
  }, [task.version, mutate]);

  const names = nameLookup(currentUser, agents ?? [], task, { labels, epics, columns });
  const hasMore = Boolean(data?.at(-1)?.next_cursor);
  const loadingMore = isValidating && size > (data?.length ?? 0);
  const entries = (data ?? [])
    .flatMap((page) => page.data)
    .map((entry) => ({ entry, text: describeActivity(entry, names) }))
    .filter((item): item is { entry: Activity; text: string } => item.text !== null)
    .reverse();

  return (
    <section className="flex flex-col gap-3" aria-labelledby="task-activity">
      <h3 id="task-activity" className="text-sm font-semibold">
        Activity
      </h3>

      {error ? (
        <p className="text-muted-foreground text-sm">Couldn&apos;t load activity: {error.message}</p>
      ) : !data ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <ol className="flex flex-col gap-2.5">
          {hasMore && (
            <li>
              <Button variant="ghost" size="sm" className="text-muted-foreground -ml-3 h-7 text-xs" disabled={loadingMore} onClick={() => void setSize(size + 1)}>
                {loadingMore ? "Loading…" : "Load older changes"}
              </Button>
            </li>
          )}
          {entries.map(({ entry, text }) => {
            const actor = entryActor(entry);
            return (
              <li key={entry.id} className="text-muted-foreground flex items-start gap-3 text-sm">
                {actor ? (
                  <ActorAvatar actor={actor} className="size-5" />
                ) : (
                  <span className="bg-muted size-5 shrink-0 rounded-full" />
                )}
                <p className="min-w-0 flex-1 break-words">
                  <span className="text-foreground font-medium">{actorLabel(entry)}</span>
                  {entry.actor.type === "ai" && " (agent)"} {text}
                  {" · "}
                  <time dateTime={entry.created_at} title={fullDate(entry.created_at)}>
                    {timeAgo(entry.created_at)}
                  </time>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
