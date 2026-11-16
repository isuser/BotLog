"use client";

import { ChevronDownIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  /** A dot in this colour before the name (labels). */
  color?: string;
  /** Shown muted, like "No labels". */
  muted?: boolean;
};

/** Over this many options, the menu gets a box to find one. */
const FIND_FROM = 8;

/**
 * A multi-select filter: a button with the filter's name and how many values are picked, opening
 * a list of values to tick. Ticking applies straight away.
 */
export function FilterMenu({
  name,
  options,
  selected,
  onToggle,
}: {
  name: string;
  options: FilterOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const findable = options.length > FIND_FROM;
  const trimmed = query.trim().toLowerCase();
  const matches = trimmed ? options.filter((o) => o.label.toLowerCase().includes(trimmed)) : options;
  const count = selected.length;

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger
        aria-label={count ? `${name}, ${count} picked` : name}
        className={cn(
          "bg-input hover:border-ring/70 focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:ring-[3px]",
          count > 0 && "border-ring/70",
        )}
      >
        {name}
        {count > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs font-semibold tabular-nums">
            {count}
          </span>
        )}
        <ChevronDownIcon className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        arrow={false}
        sideOffset={4}
        initialFocus={findable ? inputRef : undefined}
        className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2 p-2"
      >
        {findable && (
          <Input
            ref={inputRef}
            aria-label={`Find ${name.toLowerCase()}`}
            placeholder="Find…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        )}
        <ul aria-label={name} className="flex max-h-72 flex-col overflow-y-auto">
          {matches.map((option) => (
            <li key={option.value}>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => onToggle(option.value)} />
                {option.color && (
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                )}
                <span className={cn("truncate", option.muted && "text-muted-foreground")}>{option.label}</span>
              </label>
            </li>
          ))}
          {matches.length === 0 && <li className="text-muted-foreground px-2 py-1.5 text-sm">Nothing matches.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
