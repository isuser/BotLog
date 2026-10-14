import { useEffect, useRef } from "react";

/** Opens the command menu; the top bar's search button fires it. */
export const OPEN_COMMAND_MENU_EVENT = "botlog:open-command-menu";

/** Fired by the `c` shortcut; the page's main "Add a task" box listens and takes focus. */
export const NEW_TASK_EVENT = "botlog:new-task";

/**
 * Whether a key press belongs to something else: typing in a field, or moving around an open
 * list or menu. Single-key shortcuts are skipped then.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("input, textarea, select")) return true;
  return Boolean(target.closest('[role="listbox"], [role="menu"], [role="option"], [role="combobox"]'));
}

/** A plain key press: no Cmd, Ctrl or Alt (Shift is allowed, e.g. for "?"). */
export const isPlainKey = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;

/**
 * Listens to keydown on the window while `enabled`. The latest `handler` is always used, so it
 * can read current state without re-subscribing.
 */
export function useKeydown(handler: (e: KeyboardEvent) => void, enabled = true) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
