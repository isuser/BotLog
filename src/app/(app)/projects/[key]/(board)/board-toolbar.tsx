"use client";

import { ArrowDownUpIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOARD_SORT_LABELS, BOARD_SORTS, type BoardSort, type BoardView } from "@/lib/client/board-view";

export const SORTED_DRAG_HINT = "Drag to change column; order follows the sort";

/** Controls above the board that change how it's shown, not the tasks. */
export function BoardToolbar({ view, onChange }: { view: BoardView; onChange: (view: BoardView) => void }) {
  const sorted = view.sort !== "manual";
  return (
    <div className="mx-auto flex w-full max-w-[77rem] flex-wrap items-center justify-end gap-x-3 gap-y-1 px-4 pb-3">
      {sorted && <p className="text-muted-foreground hidden text-xs sm:block">{SORTED_DRAG_HINT}</p>}
      <Select
        value={view.sort}
        items={BOARD_SORT_LABELS}
        onValueChange={(next) => next && next !== view.sort && onChange({ ...view, sort: next as BoardSort })}
      >
        <SelectTrigger size="sm" aria-label="Sort tasks" aria-description={sorted ? SORTED_DRAG_HINT : undefined}>
          <ArrowDownUpIcon />
          <span className="text-muted-foreground">Sort:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOARD_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort}>
              {BOARD_SORT_LABELS[sort]}
            </SelectItem>
          ))}
          {sorted && <p className="text-muted-foreground max-w-56 px-2 pt-2 pb-1 text-xs">{SORTED_DRAG_HINT}.</p>}
        </SelectContent>
      </Select>
    </div>
  );
}
