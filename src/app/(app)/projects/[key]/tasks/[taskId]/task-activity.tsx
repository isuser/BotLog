"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { ActorAvatar, type Actor } from "@/components/actor-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { describeActivity, nameLookup } from "@/lib/client/activity";
import { api, apiAll } from "@/lib/client/api";
import { fullDate, timeAgo } from "@/lib/client/format";
import type { Activity, Agent, Task } from "@/lib/client/types";
import type { CurrentUser } from "./task-fields";

const LIMIT = 15;

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

/** The task's latest changes, oldest first. Refetched whenever the task changes. */
export function TaskActivity({ task, currentUser }: { task: Task; currentUser: CurrentUser }) {
  const { data, error, mutate } = useSWR(`/tasks/${task.id}/activity?limit=${LIMIT}`, (path: string) =>
    api<{ data: Activity[]; next_cursor: string | null }>(path),
  );
  const { data: agents } = useSWR("/agents", (path: string) => apiAll<Agent>(path));

  // Every change bumps the version, including ones made by agents and picked up on refocus.
  useEffect(() => {
    void mutate();
  }, [task.version, mutate]);

  const names = nameLookup(currentUser, agents ?? [], task);
  const entries = (data?.data ?? [])
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
          {data.next_cursor && <li className="text-muted-foreground text-xs">Older changes not shown.</li>}
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
