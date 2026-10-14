import { Progress } from "@/components/ui/progress";
import type { Epic } from "@/lib/client/types";

/** A bar of done tasks over all active tasks, with the count beside it. */
export function EpicProgress({ progress }: { progress: Epic["progress"] }) {
  return (
    <div className="flex items-center gap-3">
      {/* Progress's root doesn't stretch on its own, so it gets a flex-1 wrapper. */}
      <div className="min-w-0 flex-1">
        <Progress value={progress.percent_done} aria-label="Tasks done" className="bg-secondary h-1.5" />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {progress.done}/{progress.total} done
      </span>
    </div>
  );
}
