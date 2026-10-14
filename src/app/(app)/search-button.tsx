"use client";

import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPEN_COMMAND_MENU_EVENT } from "@/lib/client/shortcuts";

/** Opens the command menu, and shows its shortcut so it's discoverable. */
export function SearchButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-muted-foreground w-9 justify-start gap-2 px-2.5 sm:w-48"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT))}
      aria-label="Search (Cmd+K)"
    >
      <SearchIcon />
      <span className="hidden flex-1 text-left sm:inline">Search…</span>
      <kbd className="bg-muted hidden rounded border px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
    </Button>
  );
}
