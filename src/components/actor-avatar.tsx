import { BotIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A task assignee or comment author, as the API returns them. */
export type Actor =
  | { type: "user"; id: string; name: string; email: string }
  | { type: "agent"; id: string; name: string; avatar: string | null };

export function actorName(actor: Actor) {
  return actor.name || (actor.type === "user" ? actor.email : "Agent");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/** Initials for people, a bot icon for agents. */
export function ActorAvatar({ actor, className }: { actor: Actor; className?: string }) {
  const name = actorName(actor);
  return (
    <span
      aria-hidden
      title={actor.type === "agent" ? `${name} (agent)` : name}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        actor.type === "agent"
          ? "bg-agent text-brand-foreground inset-ring-brand-outline inset-ring"
          : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {actor.type === "agent" ? <BotIcon className="size-3.5" /> : initials(name)}
    </span>
  );
}
