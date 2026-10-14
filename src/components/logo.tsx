import { cn } from "@/lib/utils";

/**
 * The Board bot: a robot head whose face is three kanban columns. Lime with background-coloured
 * columns on Lime, ink with lime columns on Sandpaper (the `mark` tokens).
 */
export function BotlogMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-6 shrink-0", className)}>
      <g className="fill-mark">
        <circle cx="50" cy="9" r="6" />
        <rect x="47" y="12" width="6" height="12" />
        <rect x="12" y="22" width="76" height="66" rx="16" />
      </g>
      <g className="fill-mark-columns">
        <rect x="24" y="34" width="14" height="30" rx="4" />
        <rect x="43" y="34" width="14" height="20" rx="4" />
        <rect x="62" y="34" width="14" height="40" rx="4" />
      </g>
    </svg>
  );
}

/** The mark with "Botlog" beside it, the wordmark at about 75% of the mark's height. */
export function BotlogLogo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display flex items-center gap-2 text-xl font-bold tracking-[-0.03em]", className)}>
      <BotlogMark className="size-7" />
      Botlog
    </span>
  );
}
