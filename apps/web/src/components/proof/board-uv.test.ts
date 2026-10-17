import { describe, expect, it } from "vitest";
import { boardGeometry, cutOf, type ScanScale } from "./board-uv";
import { BOOKCASE, bookcase } from "./bookcase";

/**
 * Round 10: a board's texture lies in metres at the scan's true size,
 * its grain along its longer side, its edges carry the plies lined up
 * with its thickness, and each board is cut from its own place in the
 * sheet, the same every time.
 */
const FACE: ScanScale = { size: [0.5, 0.5], grain: "u" };
const EDGE: ScanScale = { size: [0.25, 0.018], grain: "u" };
const NONE = { du: 0, dv: 0, flip: false };

/** the coordinates of a group's vertices */
const groupUv = (g: ReturnType<typeof boardGeometry>, k: number) => {
  const uv = g.getAttribute("uv");
  const index = g.getIndex()!;
  const grp = g.groups[k]!;
  const us: number[] = [];
  const vs: number[] = [];
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    const v = index.getX(i);
    us.push(uv.getX(v));
    vs.push(uv.getY(v));
  }
  const span = (a: number[]) => Math.max(...a) - Math.min(...a);
  return { u: span(us), v: span(vs), us, vs };
};

describe("a board's metric coordinates", () => {
  it("lays the face at the scan's size, the grain along the longer side", () => {
    // a side: 2 m tall, 0.4 m deep, 18 mm thick: the grain runs up it
    const g = boardGeometry([0.018, 2, 0.4], FACE, EDGE, NONE);
    const f = groupUv(g, 0);
    expect(f.u).toBeCloseTo(2 / 0.5, 1);
    expect(f.v).toBeCloseTo(0.4 / 0.5, 1);
    // a shelf: 0.76 m wide, 0.36 m deep: along its length
    const s = groupUv(boardGeometry([0.76, 0.018, 0.36], FACE, EDGE, NONE), 0);
    expect(s.u).toBeCloseTo(0.76 / 0.5, 1);
    expect(s.v).toBeCloseTo(0.36 / 0.5, 1);
  });
  it("lines the edge's plies up with the board's thickness", () => {
    const e = groupUv(boardGeometry([0.76, 0.018, 0.36], FACE, EDGE, NONE), 1);
    // across the plies: the board's 18 mm is one period of the edge set,
    // less the half of each round its faces take
    expect(e.v).toBeGreaterThan(0.9);
    expect(e.v).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.min(...e.vs)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...e.vs)).toBeLessThanOrEqual(1 + 1e-6);
  });
  it("puts the faces in group 0 and the edges in group 1", () => {
    const g = boardGeometry([0.76, 0.018, 0.36], FACE, EDGE, NONE);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1]);
    const n = g.getAttribute("normal");
    const index = g.getIndex()!;
    const grp = g.groups[0]!;
    for (let i = grp.start; i < grp.start + grp.count; i += 3)
      expect(Math.abs(n.getY(index.getX(i)))).toBeGreaterThan(0.5);
  });
  it("offsets and turns each board as its cut says, into the uv itself", () => {
    const plain = groupUv(boardGeometry([0.76, 0.018, 0.36], FACE, EDGE, NONE), 0);
    const cut = { du: 0.3, dv: 0.6, flip: true };
    const turned = groupUv(boardGeometry([0.76, 0.018, 0.36], FACE, EDGE, cut), 0);
    // flipped: every u is the negative of the plain one offset
    expect(Math.max(...turned.us)).toBeCloseTo(
      -(Math.min(...plain.us) + 0.3),
      4,
    );
    expect(Math.min(...turned.vs)).toBeCloseTo(Math.min(...plain.vs) + 0.6, 4);
  });
});

describe("each board's cut from the sheet", () => {
  it("is seeded: the same board, the same cut", () => {
    expect(cutOf("piece", "side-left")).toEqual(cutOf("piece", "side-left"));
  });
  it("never repeats within a piece", () => {
    const { boards } = bookcase();
    const cuts = boards.map((b) => cutOf(BOOKCASE.id, b.id));
    const keys = new Set(
      cuts.map((c) => `${c.du.toFixed(4)}/${c.dv.toFixed(4)}`),
    );
    expect(keys.size).toBe(boards.length);
    for (const c of cuts) {
      expect(c.du).toBeGreaterThanOrEqual(0);
      expect(c.du).toBeLessThan(1);
    }
    // about half the boards turned end for end
    const flipped = cuts.filter((c) => c.flip).length;
    expect(flipped).toBeGreaterThan(0);
    expect(flipped).toBeLessThan(boards.length);
  });
});
