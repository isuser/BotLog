"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** `{origin}` in the text becomes this site's address once the page is in the browser. */
const ORIGIN = "{origin}";

/** A block of text to copy: a command or a config snippet. */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [origin, setOrigin] = useState("https://your-botlog.example");
  const [copied, setCopied] = useState(false);

  // The address is only known in the browser; show a placeholder until then.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);

  const value = text.replaceAll(ORIGIN, origin);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text is still selectable.
    }
  }

  return (
    <div className="not-prose bg-muted relative my-3 rounded-lg border">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{value}</pre>
      <Button variant="ghost" size="icon-sm" className="absolute top-1.5 right-1.5" aria-label={`Copy ${label}`} onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
