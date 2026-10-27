import type { PreparedImage } from "./types";

// The photo is sent at MEDIUM media resolution (~560 tokens on Gemini 3), so
// anything larger than this adds upload time without adding detail.
const SEND_MAX_SIDE = 1280;
const SEND_QUALITY = 0.85;
// Thumbnail kept in localStorage for the chat history preview (~15-30 KB).
const THUMB_MAX_SIDE = 320;
const THUMB_QUALITY = 0.7;
// Reject absurdly large originals before decoding them on a phone.
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" respects EXIF orientation so phone photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpegDataUrl(src: Drawable, maxSide: number, quality: number): string {
  const w = src.width;
  const h = src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  // White background so transparent PNGs don't turn black as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Resize a picked photo in the browser into a send copy plus a thumbnail. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't a photo.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("That photo is too large (over 30 MB).");
  }

  let src: Drawable;
  try {
    src = await decode(file);
  } catch {
    throw new Error(
      "Couldn't open that photo. Try a JPEG or PNG, or take a screenshot of it."
    );
  }

  try {
    const sendUrl = toJpegDataUrl(src, SEND_MAX_SIDE, SEND_QUALITY);
    const thumbnail = toJpegDataUrl(src, THUMB_MAX_SIDE, THUMB_QUALITY);
    return {
      data: sendUrl.slice(sendUrl.indexOf(",") + 1),
      mimeType: "image/jpeg",
      thumbnail,
    };
  } finally {
    if ("close" in src && typeof src.close === "function") src.close();
  }
}
