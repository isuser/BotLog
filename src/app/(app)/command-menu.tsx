"use client";

import {
  BotIcon,
  CheckSquareIcon,
  CircleHelpIcon,
  FolderIcon,
  KeyboardIcon,
  LayoutGridIcon,
  LayersIcon,
  ListIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, apiAll, errorMessage } from "@/lib/client/api";
import { taskHref } from "@/lib/client/board";
import { STATUS_COLORS } from "@/lib/client/task-labels";
import { applyTheme, useTheme } from "@/lib/client/theme";
import type { Profile, Project, Task } from "@/lib/client/types";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 150;
const MAX_TASKS = 8;

type Item = {
  id: string;
  group: "Tasks" | "Projects" | "Go to" | "Actions";
  label: string;
  hint?: string;
  icon?: LucideIcon;
  dot?: string;
  run: () => void;
};

const matches = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase());

/**
 * Cmd/Ctrl+K: search tasks (by short ID or title, across projects) and projects, jump to pages,
 * or run an action. Arrow keys move, Enter opens, Escape closes.
 */
export function CommandMenu({
  open,
  onOpenChange,
  projectKey,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project being viewed, if any, for its Board / List / Epics / Settings. */
  projectKey: string | null;
  onShowShortcuts: () => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const theme = useTheme();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: projects } = useSWR(open ? "/projects" : null, (path: string) => apiAll<Project>(path));
  const { data: tasks, isLoading: searching } = useSWR(
    open && debounced ? `/tasks?q=${encodeURIComponent(debounced)}&limit=${MAX_TASKS}` : null,
    (path: string) => api<{ data: Task[] }>(path).then((r) => r.data),
    { keepPreviousData: true },
  );

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  async function switchTheme() {
    onOpenChange(false);
    const next = theme === "lime" ? "sandpaper" : "lime";
    applyTheme(next);
    try {
      const { data } = await api<{ data: Profile }>("/me", { method: "PATCH", json: { theme: next } });
      void mutate("/me", data, { revalidate: false });
    } catch (e) {
      applyTheme(theme);
      toast.error(errorMessage(e));
    }
  }

  const q = query.trim();
  const items: Item[] = [];
  for (const task of q ? (tasks ?? []) : []) {
    items.push({
      id: `task:${task.id}`,
      group: "Tasks",
      label: task.title,
      hint: task.short_id,
      dot: STATUS_COLORS[task.status].dot,
      run: () => go(taskHref(task)),
    });
  }
  for (const project of (projects ?? []).filter((p) => !q || matches(`${p.name} ${p.key}`, q)).slice(0, q ? 5 : 8)) {
    items.push({ id: `project:${project.key}`, group: "Projects", label: project.name, hint: project.key, icon: FolderIcon, run: () => go(`/projects/${project.key}`) });
  }
  const pages: Omit<Item, "group">[] = [
    ...(projectKey
      ? [
          { id: "board", label: `${projectKey} board`, icon: LayoutGridIcon, run: () => go(`/projects/${projectKey}`) },
          { id: "list", label: `${projectKey} list`, icon: ListIcon, run: () => go(`/projects/${projectKey}/list`) },
          { id: "epics", label: `${projectKey} epics`, icon: LayersIcon, run: () => go(`/projects/${projectKey}/epics`) },
          { id: "project-settings", label: `${projectKey} settings`, icon: SlidersHorizontalIcon, run: () => go(`/projects/${projectKey}/settings`) },
        ]
      : []),
    { id: "my-tasks", label: "My tasks", icon: CheckSquareIcon, run: () => go("/my-tasks") },
    { id: "projects", label: "All projects", icon: FolderIcon, run: () => go("/") },
    { id: "agents", label: "Agents", icon: BotIcon, run: () => go("/agents") },
    { id: "settings", label: "Settings", icon: SettingsIcon, run: () => go("/settings") },
    { id: "help", label: "Help and agent setup", icon: CircleHelpIcon, run: () => go("/help") },
  ];
  for (const page of pages.filter((p) => !q || matches(p.label, q))) items.push({ ...page, group: "Go to" });
  const actions: Omit<Item, "group">[] = [
    {
      id: "theme",
      label: `Switch to ${theme === "lime" ? "Sandpaper" : "Lime"} theme`,
      icon: PaletteIcon,
      run: () => void switchTheme(),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      hint: "?",
      icon: KeyboardIcon,
      run: () => {
        onOpenChange(false);
        onShowShortcuts();
      },
    },
  ];
  for (const action of actions.filter((a) => !q || matches(a.label, q))) items.push({ ...action, group: "Actions" });

  const current = Math.min(active, Math.max(items.length - 1, 0));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (current + step + items.length) % items.length;
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[current]?.run();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <DialogContent showCloseButton={false} className="top-[15vh] gap-0 overflow-hidden p-0 sm:top-[15vh] sm:w-[36rem] sm:translate-y-0 data-ending-style:sm:translate-y-0 data-starting-style:sm:translate-y-0">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={items.length ? `${listId}-${current}` : undefined}
            aria-label="Search tasks, projects and pages"
            placeholder="Search tasks (BOT-42 or words), projects, pages…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
          />
          {searching && <span className="text-muted-foreground shrink-0 text-xs">Searching…</span>}
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              {q && searching ? "Searching…" : "Nothing matches."}
            </p>
          ) : (
            items.map((item, i) => (
              <div key={item.id}>
                {(i === 0 || items[i - 1].group !== item.group) && (
                  <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">{item.group}</div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
                    i === current && "bg-accent text-accent-foreground",
                  )}
                >
                  {item.dot ? (
                    <span className={cn("size-2 shrink-0 rounded-full", item.dot)} />
                  ) : item.icon ? (
                    <item.icon className="text-muted-foreground size-4 shrink-0" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.hint}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
