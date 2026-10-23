import { describe, expect, test } from "vitest";
import {
  compressToFit,
  fitWithin,
  ImageError,
  insertBlock,
  isAllowedImageSrc,
  jpegName,
  MAX_IMAGE_SIDE,
  prepareImage,
  replaceFirst,
  uploadingPlaceholder,
} from "./images";

describe("fitWithin", () => {
  test("scales the longest side down to the limit, keeping the shape", () => {
    expect(fitWithin({ width: 5120, height: 2880 }, 2560)).toEqual({ width: 2560, height: 1440 });
    expect(fitWithin({ width: 1000, height: 4000 }, 2560)).toEqual({ width: 640, height: 2560 });
  });

  test("never scales up", () => {
    expect(fitWithin({ width: 800, height: 600 }, 2560)).toEqual({ width: 800, height: 600 });
  });
});

describe("jpegName", () => {
  test("swaps the extension for .jpg", () => {
    expect(jpegName("screenshot.png")).toBe("screenshot.jpg");
    expect(jpegName("photo.final.HEIC")).toBe("photo.final.jpg");
    expect(jpegName("image")).toBe("image.jpg");
    expect(jpegName(".png")).toBe("image.jpg");
  });
});

describe("compressToFit", () => {
  /** A fake encoder whose output size grows with pixels and quality. */
  const encoder = (bytesPerPixel: number) => {
    const calls: { width: number; height: number; quality: number }[] = [];
    const encode = async ({ width, height }: { width: number; height: number }, quality: number) => {
      calls.push({ width, height, quality });
      return new Blob([new Uint8Array(Math.round(width * height * bytesPerPixel * quality))]);
    };
    return { encode, calls };
  };

  test("uses the first quality that fits, at the capped size", async () => {
    const { encode, calls } = encoder(0.2);
    const blob = await compressToFit({ width: 5120, height: 2880 }, encode);
    expect(calls).toEqual([{ width: MAX_IMAGE_SIDE, height: 1440, quality: 0.85 }]);
    expect(blob.size).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  test("lowers the quality, then the size, until it fits", async () => {
    const { encode, calls } = encoder(1);
    const blob = await compressToFit({ width: 2560, height: 1440 }, encode);
    expect(calls.map((c) => c.quality).slice(0, 4)).toEqual([0.85, 0.75, 0.6, 0.85]);
    expect(calls[3].width).toBe(1920);
    expect(blob.size).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  test("gives up on an image that never fits", async () => {
    const encode = async () => new Blob([new Uint8Array(100)]);
    await expect(compressToFit({ width: 10, height: 10 }, encode, 50)).rejects.toBeInstanceOf(ImageError);
  });
});

describe("prepareImage", () => {
  test("keeps GIFs as they are, up to 2 MB", async () => {
    const gif = new File(["GIF89a"], "party.gif", { type: "image/gif" });
    await expect(prepareImage(gif)).resolves.toEqual({ blob: gif, name: "party.gif", type: "image/gif" });
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.gif", { type: "image/gif" });
    await expect(prepareImage(big)).rejects.toThrow("GIFs can be up to 2 MB.");
  });

  test("refuses SVGs and files that aren't images", async () => {
    await expect(prepareImage(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))).rejects.toThrow(/SVG/);
    await expect(prepareImage(new File(["%PDF"], "doc.pdf", { type: "application/pdf" }))).rejects.toThrow(
      "doc.pdf isn't an image.",
    );
  });
});

describe("placeholders", () => {
  test("show the file name without characters that would break the Markdown", () => {
    expect(uploadingPlaceholder("screenshot.png")).toBe("![Uploading screenshot.png…]()");
    expect(uploadingPlaceholder("a]b[c")).toBe("![Uploading abc…]()");
  });

  test("go on their own line in place of the selection", () => {
    expect(insertBlock("", 0, 0, "X")).toEqual({ text: "X\n", cursor: 2 });
    expect(insertBlock("Beforeafter", 6, 6, "X")).toEqual({ text: "Before\nX\nafter", cursor: 9 });
    expect(insertBlock("Line\n", 5, 5, "X")).toEqual({ text: "Line\nX\n", cursor: 7 });
    expect(insertBlock("Replace me", 0, 10, "X")).toEqual({ text: "X\n", cursor: 2 });
  });

  test("are swapped once, and left alone if already deleted", () => {
    expect(replaceFirst("a P b P", "P", "img")).toBe("a img b P");
    expect(replaceFirst("nothing here", "P", "img")).toBe("nothing here");
  });
});

describe("isAllowedImageSrc", () => {
  test("allows our attachment links and https images only", () => {
    expect(isAllowedImageSrc("/api/v1/attachments/0b6f6a8e-3c1d-4b8e-9f5e-2a6c1d3e4f50")).toBe(true);
    expect(isAllowedImageSrc("https://example.com/a.png")).toBe(true);
    expect(isAllowedImageSrc("http://example.com/a.png")).toBe(false);
    expect(isAllowedImageSrc("/api/v1/tasks/BOT-1")).toBe(false);
    expect(isAllowedImageSrc("data:image/png;base64,AAAA")).toBe(false);
    expect(isAllowedImageSrc("")).toBe(false);
  });
});
