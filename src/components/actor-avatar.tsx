import { BotIcon, UserIcon } from "lucide-react";
import { actorName, type Actor } from "@/lib/client/assignees";
import { cn } from "@/lib/utils";

export { actorName, type Actor };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/**
 * Initials for people, a bot icon for agents. `label` is the hover text when it should differ
 * from the plain name, like "Botalicious (Pedro's agent)" in a shared project.
 */
export function ActorAvatar({ actor, label, className }: { actor: Actor; label?: string; className?: string }) {
  const name = actorName(actor);
  return (
    <span
      aria-hidden
      title={label && label !== name ? label : actor.type === "agent" ? `${name} (agent)` : name}
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

/** The empty seat where an avatar would be: a dashed circle, for unassigned tasks. */
export function UnassignedAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      title="Unassigned"
      className={cn(
        "text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed",
        className,
      )}
    >
      <UserIcon className="size-3.5" />
    </span>
  );
}
