"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Every shortcut, by where it works. Shown by `?` and on the Help page. */
export const SHORTCUT_GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      [["⌘", "K"], "Search and jump (Ctrl+K on Windows and Linux)"],
      [["c"], "New task"],
      [["g", "m"], "Go to My tasks"],
      [["g", "h"], "Go to Help"],
      [["?"], "Show these shortcuts"],
    ],
  },
  {
    title: "In a project",
    keys: [
      [["g", "b"], "Board"],
      [["g", "l"], "List"],
      [["g", "e"], "Epics"],
      [["g", "s"], "Project settings"],
    ],
  },
  {
    title: "With a task open",
    keys: [
      [["1"], "Move to Backlog"],
      [["2"], "Move to To do"],
      [["3"], "Move to In progress"],
      [["4"], "Move to Done"],
      [["i"], "Assign to me"],
      [["u"], "Unassign"],
    ],
  },
];

const Key = ({ children }: { children: string }) => (
  <kbd className="bg-muted text-foreground min-w-6 rounded border px-1.5 py-0.5 text-center font-mono text-xs">{children}</kbd>
);

/** The shortcut groups as key / description lists. */
export function ShortcutTable() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.04em] uppercase">{group.title}</h3>
          <dl className="flex flex-col gap-1.5 text-sm">
            {group.keys.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt>{label}</dt>
                <dd className="flex shrink-0 items-center gap-1">
                  {keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && keys[0] === "g" && <span className="text-muted-foreground text-xs">then</span>}
                      <Key>{key}</Key>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function ShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you&apos;re not typing in a field.</DialogDescription>
        </DialogHeader>
        <ShortcutTable />
      </DialogContent>
    </Dialog>
  );
}
