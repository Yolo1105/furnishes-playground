import { products } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { cutOf } from "./board-uv";
import { productPiece } from "./product-piece";

/** Round 10, Part 4: every recipe in the product studio view */
describe("a recipe's piece for the studio view", () => {
  it("gives every recipe its birch boards, inside its own box", () => {
    for (const r of products) {
      const p = productPiece(r.id)!;
      // a folding screen's leaves all stand turned
      expect(p.boards.length + p.turned.length, r.id).toBeGreaterThan(2);
      const [w, h, d] = p.size;
      for (const b of p.boards) {
        for (let a = 0; a < 3; a++) {
          const half = b.dims[a]! / 2;
          const lim = [w / 2, h, d / 2][a]! + 0.05;
          if (a === 1) {
            expect(b.at[1] - half, `${r.id} ${b.id}`).toBeGreaterThan(-0.01);
            expect(b.at[1] + half, `${r.id} ${b.id}`).toBeLessThan(lim);
          } else expect(Math.abs(b.at[a]!) + half, `${r.id} ${b.id}`).toBeLessThan(lim);
        }
      }
    }
  });
  it("cuts each board from its own place in the sheet", () => {
    for (const r of products) {
      const p = productPiece(r.id)!;
      const all = [...p.boards, ...p.turned];
      expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
      const cuts = all.map((b) => {
        const c = cutOf(p.id, b.id);
        return `${c.du.toFixed(4)}/${c.dv.toFixed(4)}`;
      });
      expect(new Set(cuts).size, r.id).toBe(cuts.length);
    }
  });
  it("knows no recipe it has not got", () => {
    expect(productPiece("no-such-piece")).toBeNull();
  });
});
