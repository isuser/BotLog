import { cn } from "@/lib/utils";

/** A task label: its name with a dot in the label's own colour. */
export function LabelChip({ label, className }: { label: { name: string; color: string }; className?: string }) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex max-w-full items-center gap-1.5 rounded-sm border px-1.5 py-px text-xs font-medium",
        className,
      )}
    >
      {/* The colour is the label's own data, so it's set inline rather than through a token. */}
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}
