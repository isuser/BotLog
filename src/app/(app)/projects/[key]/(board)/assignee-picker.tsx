"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { ActorAvatar, UnassignedAvatar, type Actor } from "@/components/actor-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errorMessage, isConflict } from "@/lib/client/api";
import { assigneeOptions, sameActor } from "@/lib/client/assignees";
import { syncTask } from "@/lib/client/board";
import type { Task } from "@/lib/client/types";
import { useProjectPeople } from "@/lib/client/use-project-people";
import { useTaskProjectSegment } from "@/lib/client/use-refs";
import { cn } from "@/lib/utils";

/** Stops an event inside the picker from reaching the card, which would open the task or start a drag. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The card's assignee avatar (or empty seat) as a button: it opens a menu to assign the task to
 * nobody, you, another member of the project, or any member's agent, saved with the task's
 * version check.
 */
export function AssigneePicker({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();
  const projectRef = useTaskProjectSegment(task);
  // Shared by every card of the project; the agents load the first time a menu opens.
  const { me, members, agents, context, name } = useProjectPeople(task.project_id, { withAgents: open });
  const options = assigneeOptions({ me, members, agents, current: task.assignee, context });

  async function assign(actor: Actor | null) {
    setOpen(false);
    if (sameActor(actor, task.assignee)) return;
    const boardKey = `/projects/${projectRef}/tasks`;
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
        aria-label={task.assignee ? `Assigned to ${name(task.assignee)}. Change assignee` : "Unassigned. Assign"}
        onPointerDown={stop}
        onClick={stop}
        onKeyDown={stop}
        className="hover:ring-ring/50 focus-visible:ring-ring/50 rounded-full outline-none hover:ring-2 focus-visible:ring-[3px]"
      >
        {task.assignee ? <ActorAvatar actor={task.assignee} label={name(task.assignee)} /> : <UnassignedAvatar />}
      </PopoverTrigger>
      <PopoverContent align="end" arrow={false} sideOffset={6} className="w-64 p-1">
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
                {actor ? <ActorAvatar actor={actor} label={label} className="size-5" /> : <UnassignedAvatar className="size-5 [&_svg]:size-3" />}
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
