"use client";

import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { LabelChip } from "@/components/label-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import type { Label, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

/** Colours for new labels, picked in turn. Mid-tone so the dot reads on both themes. */
const LABEL_COLORS = ["#84cc16", "#38bdf8", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#6b7280"];

/**
 * The task's labels. Opens a list of the project's labels to tick, and a box that filters
 * them or, with a new name, creates the label and adds it.
 */
export function LabelPicker({
  task,
  disabled,
  className,
  onChange,
}: {
  task: Task;
  disabled: boolean;
  className: string;
  onChange: (labels: Task["labels"]) => Promise<boolean>;
}) {
  const labelsKey = `/projects/${task.project_key}/labels`;
  const { data: labels, mutate } = useSWR(labelsKey, (path: string) => apiAll<Label>(path));
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = new Set(task.labels.map((l) => l.id));
  const trimmed = query.trim();
  const matches = (labels ?? []).filter((l) => l.name.toLowerCase().includes(trimmed.toLowerCase()));
  const exact = (labels ?? []).some((l) => l.name.toLowerCase() === trimmed.toLowerCase());

  const toggle = (label: Label) =>
    void onChange(
      selected.has(label.id)
        ? task.labels.filter((l) => l.id !== label.id)
        : [...task.labels, { id: label.id, name: label.name, color: label.color }],
    );

  async function create() {
    if (!trimmed || exact || creating) return;
    setCreating(true);
    try {
      const color = LABEL_COLORS[(labels?.length ?? 0) % LABEL_COLORS.length];
      const { data } = await api<{ data: Label }>(labelsKey, { method: "POST", json: { name: trimmed, color } });
      await mutate((current) => [...(current ?? []), data].sort((a, b) => a.name.localeCompare(b.name)), {
        revalidate: false,
      });
      setQuery("");
      await onChange([...task.labels, { id: data.id, name: data.name, color: data.color }]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
      // The Create button disables itself while saving, which drops focus out of the picker;
      // bring it back so typing and Escape keep working inside it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger
        disabled={disabled}
        aria-label="Labels"
        className={cn(
          className,
          "flex h-auto min-h-8 items-center gap-1 rounded-md px-3 py-1 text-left text-sm data-disabled:opacity-50",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {task.labels.length === 0 ? (
            <span className="text-muted-foreground">No labels</span>
          ) : (
            task.labels.map((label) => <LabelChip key={label.id} label={label} className="bg-card" />)
          )}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        arrow={false}
        sideOffset={4}
        initialFocus={inputRef}
        className="flex w-64 flex-col gap-2 p-2"
      >
        <Input
          ref={inputRef}
          aria-label="Find or create a label"
          placeholder="Find or create a label"
          value={query}
          maxLength={50}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length === 1 && !trimmed) return;
              if (!exact) void create();
              else if (matches[0]) toggle(matches[0]);
            }
          }}
          className="h-8"
        />
        <ul className="flex max-h-60 flex-col overflow-y-auto">
          {matches.map((label) => (
            <li key={label.id}>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                <Checkbox checked={selected.has(label.id)} onCheckedChange={() => toggle(label)} />
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="truncate">{label.name}</span>
              </label>
            </li>
          ))}
          {labels && matches.length === 0 && !trimmed && (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">No labels yet. Type a name to create one.</li>
          )}
        </ul>
        {trimmed && !exact && (
          <button
            type="button"
            disabled={creating}
            onClick={() => void create()}
            className="hover:bg-accent flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:opacity-50"
          >
            <PlusIcon className="size-4" />
            <span className="truncate">Create “{trimmed}”</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
