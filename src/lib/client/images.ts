import { MAX_ATTACHMENT_BYTES } from "@/lib/api/attachments";
import { api } from "./api";
import type { Attachment } from "./types";

/** Longest side an uploaded image keeps; bigger ones are scaled down first. */
export const MAX_IMAGE_SIDE = 2560;

/** JPEG qualities tried in turn before the image is scaled down further. */
const QUALITIES = [0.85, 0.75, 0.6];
const SHRINK = 0.75;
const MAX_SHRINKS = 4;

/** A problem with the image itself, worded for the user. */
export class ImageError extends Error {}

type Size = { width: number; height: number };

/** Scales a size down (never up) so its longest side is at most `max`. */
export function fitWithin({ width, height }: Size, max: number): Size {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** `screenshot.png` → `screenshot.jpg`. */
export function jpegName(name: string): string {
  return `${name.replace(/\.[^./]*$/, "").trim() || "image"}.jpg`;
}

/**
 * Encodes at falling qualities, then at smaller sizes, until the JPEG fits in `maxBytes`.
 * `encode` draws the image at the given size and quality.
 */
export async function compressToFit(
  original: Size,
  encode: (size: Size, quality: number) => Promise<Blob>,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<Blob> {
  let size = fitWithin(original, MAX_IMAGE_SIDE);
  for (let shrinks = 0; shrinks <= MAX_SHRINKS; shrinks++) {
    for (const quality of QUALITIES) {
      const blob = await encode(size, quality);
      if (blob.size <= maxBytes) return blob;
    }
    size = fitWithin(size, Math.max(size.width, size.height) * SHRINK);
  }
  throw new ImageError("This image doesn't fit in 2 MB, even compressed.");
}

export type PreparedImage = { blob: Blob; name: string; type: "image/jpeg" | "image/gif" };

/**
 * Gets an image ready to upload: converted to JPEG and compressed to fit in 2 MB, which
 * also drops its metadata (such as a photo's location). GIFs are kept as they are, so
 * animations survive.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const name = file.name || "image";
  if (file.type === "image/svg+xml") throw new ImageError("SVG images aren't supported.");
  if (!file.type.startsWith("image/")) throw new ImageError(`${name} isn't an image.`);
  if (file.type === "image/gif") {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ImageError("GIFs can be up to 2 MB.");
    return { blob: file, name, type: "image/gif" };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError(`Couldn't read ${name}.`);
  }
  try {
    const blob = await compressToFit(bitmap, (size, quality) => encodeJpeg(bitmap, size, quality));
    return { blob, name: jpegName(name), type: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}

function encodeJpeg(image: ImageBitmap, { width, height }: Size, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("Couldn't convert the image.");
  // JPEG has no transparency; without a background, transparent parts turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError("Couldn't convert the image."))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Converts and uploads an image for a task: the API records it and hands back a signed
 * URL, and the file goes straight to Storage. Returns the Markdown that shows it.
 */
export async function uploadImage(taskId: string, file: File): Promise<string> {
  const image = await prepareImage(file);
  const { data, upload_url } = await api<{ data: Attachment; upload_url: string }>(`/tasks/${taskId}/attachments`, {
    method: "POST",
    json: { file_name: image.name, content_type: image.type, size: image.blob.size },
  });
  const response = await fetch(upload_url, { method: "PUT", headers: { "content-type": image.type }, body: image.blob });
  if (!response.ok) throw new Error(`Couldn't upload ${image.name}. Try again.`);
  return data.markdown;
}

/** What the text shows while an image uploads, swapped for the image's Markdown when done. */
export function uploadingPlaceholder(name: string): string {
  return `![Uploading ${name.replace(/[[\]\\\r\n]/g, "").trim() || "image"}…]()`;
}

/**
 * Puts `insert` in place of the selection, on its own line(s). Returns the new text and
 * where the cursor goes.
 */
export function insertBlock(text: string, start: number, end: number, insert: string) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const trail = after.startsWith("\n") ? "" : "\n";
  const block = lead + insert + trail;
  return { text: before + block + after, cursor: before.length + block.length };
}

/** Replaces the first occurrence of `find`, if it's still there (the user may have deleted it). */
export function replaceFirst(text: string, find: string, replacement: string): string {
  const index = text.indexOf(find);
  if (index === -1) return text;
  return text.slice(0, index) + replacement + text.slice(index + find.length);
}

/** Images Markdown may load: our own attachment links and https images, nothing else. */
export function isAllowedImageSrc(src: string): boolean {
  return /^\/api\/v1\/attachments\/[0-9a-f-]{36}$/i.test(src) || src.startsWith("https://");
}
