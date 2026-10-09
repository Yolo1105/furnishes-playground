/**
 * The size a photo is traced at: the screen's own drawing buffer, or
 * one of three fixed sizes, kept to what the device can hold in one
 * texture. A fixed size keeps the stage's aspect for the picture's
 * framing (the camera is the stage's), so 1080p on a square stage is
 * 1080 px tall and as wide as the stage's shape makes it.
 */
export type PhotoSize = "screen" | "1080p" | "1440p" | "4k";
export const PHOTO_SIZES: readonly {
  id: PhotoSize;
  name: string;
  tall: number;
}[] = [
  { id: "screen", name: "Screen", tall: 0 },
  { id: "1080p", name: "1080p", tall: 1080 },
  { id: "1440p", name: "1440p", tall: 1440 },
  { id: "4k", name: "4K", tall: 2160 },
];

/** the pixels a photo of a size takes on a stage of `width` × `height`
    buffer pixels, or null when the device cannot hold it */
export const photoPixels = (
  size: PhotoSize,
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } | null => {
  if (width <= 0 || height <= 0) return null;
  const tall = PHOTO_SIZES.find((s) => s.id === size)?.tall ?? 0;
  const out =
    tall === 0
      ? { width: Math.round(width), height: Math.round(height) }
      : { width: Math.round((tall * width) / height), height: tall };
  if (out.width > maxSide || out.height > maxSide) return null;
  // rows are read back by the device in whole 256-byte runs: a width
  // that fills them exactly needs no padding to strip
  return out;
};

/** the sizes a device can offer for a stage, each with its pixels */
export const photoChoices = (width: number, height: number, maxSide: number) =>
  PHOTO_SIZES.map((s) => ({
    ...s,
    pixels: photoPixels(s.id, width, height, maxSide),
  }));
