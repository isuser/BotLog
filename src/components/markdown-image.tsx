"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isAllowedImageSrc } from "@/lib/client/images";

/**
 * An image in rendered Markdown: lazy-loaded, capped in size, and opened full size on click.
 * Only our own attachment links and https images load; anything else shows its alt text.
 */
export function MarkdownImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!src || !isAllowedImageSrc(src)) {
    return alt ? <span className="text-muted-foreground italic">{alt}</span> : null;
  }

  return (
    <>
      <button
        type="button"
        className="my-2 block max-w-full cursor-zoom-in"
        aria-label={`Open ${alt || "image"} full size`}
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked images can't go through next/image */}
        <img src={src} alt={alt ?? ""} title={title} loading="lazy" className="my-0 max-h-96 max-w-full rounded-md border" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[95vh] w-auto max-w-[95vw] flex-col items-center gap-3 p-3 sm:w-auto sm:max-w-[95vw]">
          <DialogTitle className="sr-only">{alt || "Image"}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src={src} alt={alt ?? ""} className="max-h-[85vh] max-w-[calc(95vw-1.5rem)] object-contain" />
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            Open original <ExternalLinkIcon className="size-3" />
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}
