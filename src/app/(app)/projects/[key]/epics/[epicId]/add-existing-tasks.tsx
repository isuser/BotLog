"use client";

import { ListPlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiAll } from "@/lib/client/api";
import { STATUS_COLORS } from "@/lib/client/task-labels";
import type { Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 50;

/**
 * Picks tasks already in the project to put in this epic. Searches by title or short ID;
 * stays open so several can be added in a row. Tasks in another epic say which one.
 */
export function AddExistingTasks({
  projectKey,
  epicId,
  onAdd,
}: {
  projectKey: string;
  epicId: string;
  onAdd: (task: Task) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The board's own key, so it's usually cached and stays in sync with the board.
  const { data: tasks } = useSWR(open ? `/projects/${projectKey}/tasks` : null, (path: string) => apiAll<Task>(path));

  const q = query.trim().toLowerCase();
  const candidates = (tasks ?? []).filter(
    (t) => t.epic_id !== epicId && (!q || t.title.toLowerCase().includes(q) || t.short_id.toLowerCase().includes(q)),
  );

  async function add(task: Task) {
    setAdding(task.id);
    try {
      await onAdd(task);
    } finally {
      setAdding(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" className="shrink-0">
            <ListPlusIcon /> Add existing
          </Button>
        }
      />
      <PopoverContent align="end" arrow={false} sideOffset={4} initialFocus={inputRef} className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 p-2">
        <Input
          ref={inputRef}
          aria-label="Search tasks by title or ID"
          placeholder="Search tasks by title or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8"
        />
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {!tasks ? (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">Loading…</li>
          ) : candidates.length === 0 ? (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">
              {q ? "No matching tasks." : "Every task is already in this epic."}
            </li>
          ) : (
            candidates.slice(0, MAX_SHOWN).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void add(task)}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_COLORS[task.status].dot)} />
                  <span className="text-muted-foreground w-14 shrink-0 font-mono text-xs">{task.short_id}</span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.epic && (
                    <span className="text-muted-foreground max-w-28 shrink-0 truncate text-xs" title={`In ${task.epic.title}`}>
                      in {task.epic.title}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
          {candidates.length > MAX_SHOWN && (
            <li className="text-muted-foreground px-2 py-1.5 text-xs">
              Showing {MAX_SHOWN} of {candidates.length}. Search to narrow it down.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
