import { propsOf, useScene } from "./scene-store";
import {
  activeOf,
  footprintOf,
  openingsOf,
  roomLabel,
  type RoomSpec,
  useRoom,
} from "./room-store";
import { ROOM_NAMES } from "./room-data";
import { sgd } from "./assets-data";

/**
 * What Export and Checkout hand over: the plan as the SVG on the stage,
 * the 3D view as a PNG of its canvas, the room and its pieces as JSON,
 * and the cart as a CSV shopping list. Each lands as a download; the
 * file is named after the room.
 */
const stem = () => {
  const st = useRoom.getState();
  const r = activeOf(st);
  return `${ROOM_NAMES[r.room].toLowerCase().replace(/\s+/g, "-")}-${st.flat}`;
};

const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
};

/** the SVG's styles come from the stylesheet; a file needs them inline */
const INLINE = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "font-size",
  "font-weight",
  "font-family",
  "letter-spacing",
  "text-anchor",
] as const;

/** the plan on the stage as an .svg; false when no plan is shown */
export const exportPlanSvg = () => {
  const svg = document.querySelector<SVGSVGElement>(".plan-svg");
  if (!svg) return false;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = svg.querySelectorAll<SVGElement>("*");
  copy.querySelectorAll<SVGElement>("*").forEach((el, i) => {
    const cs = getComputedStyle(from[i]!);
    for (const p of INLINE) el.style.setProperty(p, cs.getPropertyValue(p));
  });
  copy.removeAttribute("class");
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const text = new XMLSerializer().serializeToString(copy);
  download(`${stem()}-plan.svg`, new Blob([text], { type: "image/svg+xml" }));
  return true;
};

/** the 3D view as a .png; false when no 3D canvas is shown */
export const exportScenePng = () => {
  const canvas = document.querySelector<HTMLCanvasElement>(".stage-3d canvas");
  if (!canvas || canvas.width === 0) return false;
  canvas.toBlob((blob) => {
    if (blob) download(`${stem()}-3d.png`, blob);
  }, "image/png");
  return true;
};

/** the room and every piece, with the Detail tab's changes, as .json */
export const exportRoomJson = () => {
  const st = useRoom.getState();
  const r = activeOf(st);
  const s = useScene.getState();
  /** a room as the file has it */
  const roomOf = (rm: RoomSpec) => ({
    id: rm.id,
    room: rm.room,
    name: roomLabel(st.rooms, rm),
    position: rm.pos,
    width: rm.width,
    depth: rm.depth,
    height: rm.height,
    openings: openingsOf(st, rm).map(
      ({ id: _id, hdb: _hdb, join: _join, ...o }) => o,
    ),
    floor: rm.floor,
    wallTone: rm.wallTone,
    footprint: footprintOf(rm),
  });
  const data = {
    flat: st.flat,
    // the active room first, as before the flat had several
    room: roomOf(r),
    rooms: st.rooms.map(roomOf),
    doorways: st.joins
      .filter((j) => j.open)
      .map((j) => ({
        between: [j.a, j.b],
        kind: j.kind,
        into: j.into,
        at: j.at,
        width: j.width,
      })),
    pieces: s.groups.flatMap((g) =>
      g.items.map((n) => ({
        id: n.id,
        name: n.name,
        kind: n.kind,
        category: n.category,
        price: n.price ?? null,
        inCart: s.cart.includes(n.id),
        labelled: s.labels.includes(n.id),
        ...propsOf(n, s.overrides),
        roomId: propsOf(n, s.overrides).roomId ?? st.rooms[0]!.id,
        parts: n.children?.map((c) => c.name) ?? [],
      })),
    ),
  };
  download(
    `${stem()}.json`,
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
};

/** the cart as a .csv shopping list with its total */
export const exportCartCsv = () => {
  const s = useScene.getState();
  const rows = s.groups
    .flatMap((g) => g.items)
    .filter((n) => s.cart.includes(n.id))
    .map((n) => [n.name, n.category, n.price ?? 0]);
  const total = rows.reduce((t, r) => t + Number(r[2]), 0);
  const csv = [
    ["Piece", "Category", "Price (S$)"],
    ...rows,
    ["Total", "", total],
  ]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  download(
    `${stem()}-shopping-list.csv`,
    new Blob([csv], { type: "text/csv" }),
  );
  return sgd(total);
};
