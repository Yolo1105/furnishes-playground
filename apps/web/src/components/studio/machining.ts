import { cutListCsv, dxfOf, nest, SHEET, type Panel } from "@furnishes/domain";
import { download } from "./export";

/**
 * What a piece's panels leave for the shop: each panel's face as a
 * DXF with its machining, and the piece's cut list, its panels nested
 * on the shop's sheets, as a CSV. Each lands as a download, named
 * after the piece and the panel.
 */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const exportPanelDxf = (piece: string, panel: Panel) =>
  download(
    `${slug(piece)}-${slug(panel.name)}-${panel.id}.dxf`,
    new Blob([dxfOf(panel)], { type: "application/dxf" }),
  );

export const exportCutList = (piece: string, panels: readonly Panel[]) =>
  download(
    `${slug(piece)}-cut-list.csv`,
    new Blob([cutListCsv(nest(panels, SHEET), panels)], {
      type: "text/csv;charset=utf-8",
    }),
  );
