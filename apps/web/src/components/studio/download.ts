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
