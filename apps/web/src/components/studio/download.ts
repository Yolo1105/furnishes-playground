/**
 * A file handed to the browser to save. On its own here, with nothing
 * heavy behind it: the exporters (export.ts) bring three's glTF
 * exporter and the scene copy, and come only when an export is asked
 * for, while the cut list, the DXF and a part's STEP need this alone.
 */
export const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
};

/** the 3D stage's picture as a .png named `name`; false when no 3D
    canvas is shown */
export const saveStage = (name: string) => {
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".shell-stage .stage-3d canvas",
  );
  if (!canvas || canvas.width === 0) return false;
  canvas.toBlob((blob) => {
    if (blob) download(name, blob);
  }, "image/png");
  return true;
};

/** a photo's file name, by the day it was taken */
export const photoName = () =>
  `furnishes-photo-${new Date().toISOString().slice(0, 10)}.png`;
