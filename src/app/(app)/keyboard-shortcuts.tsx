"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isPlainKey, isTypingTarget, NEW_TASK_EVENT, OPEN_COMMAND_MENU_EVENT, useKeydown } from "@/lib/client/shortcuts";
import { CommandMenu } from "./command-menu";
import { ShortcutsHelp } from "./shortcuts-help";

/** How long after `g` the second key of a go-to shortcut still counts. */
const SEQUENCE_MS = 1000;

const GO_TO: Record<string, (projectKey: string | null) => string | null> = {
  m: () => "/my-tasks",
  h: () => "/help",
  b: (key) => key && `/projects/${key}`,
  l: (key) => key && `/projects/${key}/list`,
  e: (key) => key && `/projects/${key}/epics`,
  s: (key) => key && `/projects/${key}/settings`,
};

/**
 * App-wide keys: Cmd/Ctrl+K opens the command menu, `?` the shortcut list, `c` focuses the
 * page's "Add a task" box, and `g` then a letter jumps to a page. Task shortcuts (1–4, i, u)
 * live in the task panel.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const projectKey = /^\/projects\/([^/]+)/.exec(pathname)?.[1]?.toUpperCase() ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => {
    const open = () => setMenuOpen(true);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, open);
    return () => window.removeEventListener(OPEN_COMMAND_MENU_EVENT, open);
  }, []);

  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setMenuOpen((open) => !open);
      return;
    }
    if (menuOpen || helpOpen || !isPlainKey(e) || isTypingTarget(e.target)) return;

    if (Date.now() - pendingG.current < SEQUENCE_MS) {
      pendingG.current = 0;
      const href = GO_TO[e.key]?.(projectKey);
      if (href) {
        e.preventDefault();
        router.push(href);
      }
      return;
    }
    if (e.key === "g") {
      pendingG.current = Date.now();
    } else if (e.key === "?") {
      e.preventDefault();
      setHelpOpen(true);
    } else if (e.key === "c") {
      e.preventDefault();
      window.dispatchEvent(new Event(NEW_TASK_EVENT));
    }
  });

  return (
    <>
      <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} projectKey={projectKey} onShowShortcuts={() => setHelpOpen(true)} />
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
