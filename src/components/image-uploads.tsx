"use client";

import { ImageIcon } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/client/api";
import { insertBlock, replaceFirst, uploadImage, uploadingPlaceholder } from "@/lib/client/images";

const imagesIn = (files: FileList | null | undefined) =>
  Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));

/**
 * Image uploads for a Markdown textarea: paste, drop, or pick files. Each image shows as
 * `![Uploading name…]()` at the cursor until it's uploaded, then as its Markdown. Without a
 * task (an epic's description) uploads are off, since images belong to a task.
 */
export function useImageUploads(taskId: string | undefined, setText: (update: (text: string) => string) => void) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState(0);

  function add(files: File[]) {
    if (!taskId || files.length === 0) return;
    const placeholders = files.map((file) => uploadingPlaceholder(file.name || "image"));
    const textarea = textareaRef.current;
    setText((text) => {
      const start = textarea?.selectionStart ?? text.length;
      const end = textarea?.selectionEnd ?? text.length;
      return insertBlock(text, start, end, placeholders.join("\n")).text;
    });

    setPending((n) => n + files.length);
    files.forEach((file, i) => {
      uploadImage(taskId, file)
        .then((markdown) => setText((text) => replaceFirst(text, placeholders[i], markdown)))
        .catch((error) => {
          setText((text) => replaceFirst(text, placeholders[i], ""));
          toast.error(errorMessage(error));
        })
        .finally(() => setPending((n) => n - 1));
    });
  }

  return {
    enabled: Boolean(taskId),
    /** True while any image is still uploading; saving then would keep the placeholder. */
    uploading: pending > 0,
    add,
    textareaProps: {
      ref: textareaRef,
      onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = imagesIn(e.clipboardData.files);
        if (!taskId || files.length === 0) return;
        e.preventDefault();
        add(files);
      },
      onDragOver: (e: DragEvent<HTMLTextAreaElement>) => {
        if (taskId && e.dataTransfer.types.includes("Files")) e.preventDefault();
      },
      onDrop: (e: DragEvent<HTMLTextAreaElement>) => {
        const files = imagesIn(e.dataTransfer.files);
        if (!taskId || files.length === 0) return;
        e.preventDefault();
        add(files);
      },
    },
  };
}

/** "Add image": picks image files for `useImageUploads`. */
export function AddImageButton({
  uploads,
  disabled,
}: {
  uploads: ReturnType<typeof useImageUploads>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!uploads.enabled) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImageIcon />
        {uploads.uploading ? "Uploading…" : "Add image"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          uploads.add(imagesIn(e.target.files));
          e.target.value = "";
        }}
      />
    </>
  );
}
