import { LayersIcon } from "lucide-react";
import { epicColor } from "@/lib/client/task-labels";
import { cn } from "@/lib/utils";

/**
 * A task's epic as a pill tinted with the epic's colour. The text stays in the foreground
 * colour so it reads on both themes; the colour is in the icon and a light tint behind it.
 */
export function EpicPill({ epic, className }: { epic: { id: string; title: string }; className?: string }) {
  const color = epicColor(epic.id);
  return (
    <span
      title={`Epic: ${epic.title}`}
      // The colour is derived from the epic's id, so it's set inline rather than through a token.
      style={{ backgroundColor: `${color}26`, borderColor: `${color}66` }}
      className={cn(
        "text-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-px text-xs font-medium",
        className,
      )}
    >
      <LayersIcon className="size-3 shrink-0" style={{ color }} aria-hidden />
      <span className="truncate">{epic.title}</span>
    </span>
  );
}
