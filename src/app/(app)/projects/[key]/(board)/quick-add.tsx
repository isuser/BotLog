"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NEW_TASK_EVENT } from "@/lib/client/shortcuts";

/** One-line task creation at the top of a column. Enter adds, Escape clears. */
export function QuickAdd({
  columnTitle,
  onAdd,
  focusOnShortcut = false,
}: {
  columnTitle: string;
  onAdd: (title: string) => Promise<void>;
  /** Take focus when the `c` (new task) shortcut fires. One box per page should. */
  focusOnShortcut?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusOnShortcut) return;
    const focus = () => inputRef.current?.focus();
    window.addEventListener(NEW_TASK_EVENT, focus);
    return () => window.removeEventListener(NEW_TASK_EVENT, focus);
  }, [focusOnShortcut]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      await onAdd(trimmed);
      setTitle("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Input
        ref={inputRef}
        aria-label={`Add a task to ${columnTitle}`}
        placeholder="Add a task"
        leadingIcon={<PlusIcon />}
        maxLength={500}
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setTitle("");
        }}
        className="border-dashed bg-transparent shadow-none"
      />
    </form>
  );
}
