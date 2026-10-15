import { describe, expect, it } from "vitest";
import { type Drape, drapeGeometry } from "./drape";

/** a throw over a sofa's arm: 180 mm across, half a metre wide,
    falling 120 mm in and 220 mm out */
const arm: Drape = {
  over: 0.18,
  wide: 0.5,
  hang: [0.12, 0.22],
  round: 0.04,
  thick: 0.006,
  puff: 0,
  ends: 0,
  folds: 3,
  depth: 0.025,
  seed: 4,
};
/** a duvet over a double mattress */
const duvet: Drape = {
  over: 1.56,
  wide: 1.3,
  hang: [0.24, 0.24],
  round: 0.04,
  thick: 0.04,
  puff: 0.03,
  ends: 0.12,
  folds: 4,
  depth: 0.012,
  seed: 9,
};
const points = (d: Drape) => {
  const p = drapeGeometry(d).getAttribute("position");
  return Array.from(
    { length: p.count },
    (_, i) => [p.getX(i), p.getY(i), p.getZ(i)] as const,
  );
};

describe("cloth laid over a support (round 8, Part 5)", () => {
  it("is the same cloth for the same drape, and another for another seed", () => {
    expect(drapeGeometry({ ...arm })).toBe(drapeGeometry(arm));
    expect(points({ ...arm, seed: 5 })).not.toEqual(points(arm));
  });
  it("is a closed shell, wound outward, about as thick as it is said to be", () => {
    for (const d of [arm, duvet]) {
      const g = drapeGeometry(d);
      const p = g.getAttribute("position");
      const ix = g.getIndex()!;
      let volume = 0;
      for (let t = 0; t < ix.count; t += 3) {
        const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
        const [ax, ay, az] = [p.getX(a), p.getY(a), p.getZ(a)];
        const [bx, by, bz] = [p.getX(b), p.getY(b), p.getZ(b)];
        const [cx, cy, cz] = [p.getX(c), p.getY(c), p.getZ(c)];
        volume +=
          (ax * (by * cz - bz * cy) -
            ay * (bx * cz - bz * cx) +
            az * (bx * cy - by * cx)) /
          6;
      }
      const sheet = (d.over + d.hang[0] + d.hang[1]) * d.wide * d.thick;
      expect(volume).toBeGreaterThan(sheet * 0.6);
      expect(volume).toBeLessThan(sheet * 1.1);
    }
  });
  it("never sinks into its support", () => {
    // the support: a box, its two top edges rounded
    const inside = (d: Drape, x: number, y: number) => {
      const half = d.over / 2;
      if (Math.abs(x) >= half - 1e-4 || y >= -1e-4) return false;
      const cx = Math.abs(x) - (half - d.round);
      const cy = y + d.round;
      return cx <= 0 || cy <= 0 || Math.hypot(cx, cy) < d.round - 1e-4;
    };
    for (const d of [arm, duvet])
      for (const [x, y] of points(d)) expect(inside(d, x, y)).toBe(false);
  });
  it("falls to its hem, folding more the further it falls", () => {
    const p = points(arm);
    const lowest = Math.min(...p.map(([, y]) => y));
    expect(lowest).toBeLessThan(-arm.hang[1] + arm.depth);
    expect(lowest).toBeGreaterThan(-arm.hang[1] - arm.depth);
    // how far the outer side stands off: a little at the top, more and
    // more uneven near the hem
    const off = (y0: number, y1: number) =>
      p
        .filter(([x, y]) => x > 0 && y < y0 && y > y1)
        .map(([x]) => x - arm.over / 2);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(off(-0.18, -0.21))).toBeGreaterThan(
      spread(off(-0.05, -0.07)) * 2,
    );
  });
  it("puffs a duvet up in its middle", () => {
    const p = points(duvet);
    const top = (x0: number) =>
      Math.max(
        ...p
          .filter(([x, , z]) => Math.abs(x - x0) < 0.03 && Math.abs(z) < 0.1)
          .map(([, y]) => y),
      );
    expect(top(0) - top(duvet.over / 2 - 0.1)).toBeGreaterThan(
      duvet.puff * 0.5,
    );
  });
  it("carries what its material and its bake read", () => {
    const g = drapeGeometry(arm);
    for (const name of ["normal", "uv", "color", "ply"])
      expect(g.getAttribute(name).count).toBe(g.getAttribute("position").count);
  });
});
