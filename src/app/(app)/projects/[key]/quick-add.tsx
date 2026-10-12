"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

/** One-line task creation at the top of a column. Enter adds, Escape clears. */
export function QuickAdd({ columnTitle, onAdd }: { columnTitle: string; onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);

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
        className="bg-transparent shadow-none"
      />
    </form>
  );
}
