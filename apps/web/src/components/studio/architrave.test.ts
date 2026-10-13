import { describe, expect, it } from "vitest";
import { ARCHITRAVE, architraveGeometry } from "./architrave";

describe("a door's architrave", () => {
  const g = architraveGeometry(0.9, 2.1);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  it("stands off the wall by its thickness, round the opening", () => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.z).toBeCloseTo(ARCHITRAVE.thick, 3);
    expect(b.min.z).toBeCloseTo(0, 6);
    expect(b.max.x).toBeCloseTo(0.45 + ARCHITRAVE.width, 6);
    expect(b.max.y).toBeCloseTo(2.1 + ARCHITRAVE.width, 6);
  });
  it("meets at its corners in mitres on the 45° line", () => {
    // every point at the head's corner lies on y - tall = |x| - width/2
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      const y = pos.getY(i);
      if (y > 2.1 + 1e-6) expect(y - 2.1).toBeLessThanOrEqual(x - 0.45 + 1e-6);
    }
  });
  it("faces out of the wall along its face", () => {
    let out = 0;
    for (let i = 0; i < nor.count; i++) if (nor.getZ(i) > 0.5) out++;
    expect(out / nor.count).toBeGreaterThan(0.4);
  });
});
