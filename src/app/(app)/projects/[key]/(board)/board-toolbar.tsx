"use client";

import { ArrowDownUpIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BOARD_SORT_LABELS,
  BOARD_SORTS,
  clearFilters,
  isFiltered,
  NONE,
  PRIORITIES,
  toggleFilter,
  type BoardSort,
  type BoardView,
} from "@/lib/client/board-view";
import { PRIORITY_LABELS } from "@/lib/client/task-labels";
import type { Epic, Label, Task } from "@/lib/client/types";
import { FilterMenu, type FilterOption } from "./filter-menu";

export const SORTED_DRAG_HINT = "Drag to change column; order follows the sort";

const PRIORITY_OPTIONS: FilterOption[] = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p], muted: p === "none" }));

/** Controls above the board that change how it's shown, not the tasks: filters on the left, sort on the right. */
export function BoardToolbar({
  view,
  onChange,
  labels,
  epics,
}: {
  view: BoardView;
  onChange: (view: BoardView) => void;
  labels: Label[] | undefined;
  epics: Epic[] | undefined;
}) {
  const sorted = view.sort !== "manual";
  const labelOptions: FilterOption[] = [
    { value: NONE, label: "No labels", muted: true },
    ...(labels ?? []).map((l) => ({ value: l.id, label: l.name, color: l.color })),
  ];
  const epicOptions: FilterOption[] = [
    { value: NONE, label: "No epic", muted: true },
    ...(epics ?? []).map((e) => ({ value: e.id, label: e.title })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[77rem] flex-wrap items-center gap-2 px-4 pb-3">
      <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <FilterMenu
          name="Labels"
          options={labelOptions}
          selected={view.labels}
          onToggle={(id) => onChange(toggleFilter(view, "labels", id))}
        />
        <FilterMenu
          name="Epic"
          options={epicOptions}
          selected={view.epics}
          onToggle={(id) => onChange(toggleFilter(view, "epics", id))}
        />
        <FilterMenu
          name="Priority"
          options={PRIORITY_OPTIONS}
          selected={view.priorities}
          onToggle={(p) => onChange(toggleFilter(view, "priorities", p as Task["priority"]))}
        />
        {isFiltered(view) && (
          <Button variant="ghost" size="sm" onClick={() => onChange(clearFilters(view))}>
            <XIcon />
            Clear
          </Button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {sorted && <p className="text-muted-foreground hidden text-xs lg:block">{SORTED_DRAG_HINT}</p>}
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
    </div>
  );
}
