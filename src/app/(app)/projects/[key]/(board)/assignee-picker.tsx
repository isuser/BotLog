"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { ActorAvatar, actorName, UnassignedAvatar, type Actor } from "@/components/actor-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, apiAll, errorMessage, isConflict } from "@/lib/client/api";
import { syncTask } from "@/lib/client/board";
import type { Agent, Profile, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/** Stops an event inside the picker from reaching the card, which would open the task or start a drag. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const sameActor = (a: Actor | null, b: Actor | null) => (a === null ? b === null : b !== null && a.type === b.type && a.id === b.id);

/**
 * The card's assignee avatar (or empty seat) as a button: it opens a menu to assign the task to
 * nobody, you, or one of the workspace's agents, saved with the task's version check.
 */
export function AssigneePicker({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();
  // Both are usually cached already: /me by the theme sync, /agents by the task panel.
  const { data: me } = useSWR("/me", (path: string) => api<{ data: Profile }>(path).then((r) => r.data));
  const { data: agents } = useSWR(open ? "/agents" : null, (path: string) => apiAll<Agent>(path));

  const options: { actor: Actor | null; label: string }[] = [{ actor: null, label: "Unassigned" }];
  if (me) options.push({ actor: { type: "user", id: me.id, name: me.name, email: me.email }, label: "Me" });
  for (const agent of agents ?? []) {
    options.push({ actor: { type: "agent", id: agent.id, name: agent.name, avatar: agent.avatar }, label: agent.name });
  }
  // Someone else, or an archived agent: keep them listed so the current choice shows.
  if (task.assignee && !options.some((o) => sameActor(o.actor, task.assignee))) {
    options.splice(1, 0, { actor: task.assignee, label: actorName(task.assignee) });
  }

  async function assign(actor: Actor | null) {
    setOpen(false);
    if (sameActor(actor, task.assignee)) return;
    const boardKey = `/projects/${task.project_key}/tasks`;
    try {
      await mutate(
        boardKey,
        async (tasks?: Task[]) => {
          const { data } = await api<{ data: Task }>(`/tasks/${task.id}`, {
            method: "PATCH",
            json: { assignee: actor && { type: actor.type, id: actor.id }, version: task.version },
          });
          return tasks && syncTask(tasks, data);
        },
        {
          optimisticData: (tasks?: Task[]) => (tasks ?? []).map((t) => (t.id === task.id ? { ...t, assignee: actor } : t)),
          rollbackOnError: true,
          revalidate: false,
        },
      );
      // An open panel for this task shows the change too.
      void mutate(`/tasks/${task.short_id}`);
    } catch (e) {
      toast[isConflict(e) ? "message" : "error"](isConflict(e) ? "This task was updated, reloaded" : errorMessage(e));
      void mutate(boardKey);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={task.assignee ? `Assigned to ${actorName(task.assignee)}. Change assignee` : "Unassigned. Assign"}
        onPointerDown={stop}
        onClick={stop}
        onKeyDown={stop}
        className="hover:ring-ring/50 focus-visible:ring-ring/50 rounded-full outline-none hover:ring-2 focus-visible:ring-[3px]"
      >
        {task.assignee ? <ActorAvatar actor={task.assignee} /> : <UnassignedAvatar />}
      </PopoverTrigger>
      <PopoverContent align="end" arrow={false} sideOffset={6} className="w-56 p-1">
        {/* Portalled, but React events still bubble to the card: keep them here. */}
        <div onClick={stop} onPointerDown={stop} onKeyDown={stop} role="group" aria-label="Assign to">
          {options.map(({ actor, label }) => {
            const current = sameActor(actor, task.assignee);
            return (
              <button
                key={actor ? `${actor.type}:${actor.id}` : "none"}
                type="button"
                aria-pressed={current}
                onClick={() => void assign(actor)}
                className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none"
              >
                {actor ? <ActorAvatar actor={actor} className="size-5" /> : <UnassignedAvatar className="size-5 [&_svg]:size-3" />}
                <span className={cn("min-w-0 flex-1 truncate", !actor && "text-muted-foreground")}>{label}</span>
                {current && <CheckIcon className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
