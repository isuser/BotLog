"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** A task or epic description in Markdown: rendered, or edited with Save and Cancel. */
export function DescriptionEditor({
  description,
  disabled,
  onSave,
}: {
  description: string;
  disabled: boolean;
  onSave: (description: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft === null || saving) return;
    if (draft === description) return setDraft(null);
    setSaving(true);
    // On a conflict the task reloads underneath and the draft stays, so nothing typed is lost.
    if (await onSave(draft)) setDraft(null);
    setSaving(false);
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="description-heading">
      <div className="flex items-center justify-between">
        <h3 id="description-heading" className="text-sm font-semibold">
          Description
        </h3>
        {draft === null && description && !disabled && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDraft(description)}>
            <PencilIcon />
            Edit
          </Button>
        )}
      </div>

      {draft !== null ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Textarea
            aria-label="Description"
            autoFocus
            value={draft}
            maxLength={100_000}
            placeholder="Add details in Markdown"
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                // Cancel the edit instead of closing the panel.
                e.stopPropagation();
                setDraft(null);
              }
            }}
            className="max-h-[60vh] min-h-32 font-mono text-sm md:text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground mr-auto hidden text-xs sm:inline">Markdown · ⌘/Ctrl + Enter to save</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              Save
            </Button>
          </div>
        </form>
      ) : description ? (
        <Markdown>{description}</Markdown>
      ) : disabled ? (
        <p className="text-muted-foreground text-sm">No description.</p>
      ) : (
        <button
          type="button"
          onClick={() => setDraft("")}
          className="text-muted-foreground hover:border-ring/70 rounded-md border border-dashed px-3 py-6 text-left text-sm transition-colors"
        >
          Add a description…
        </button>
      )}
    </section>
  );
}
