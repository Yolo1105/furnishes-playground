import { randomInt } from "node:crypto";
import { checkRecipe, designOf, type DesignRecipe } from "@furnishes/domain";
import { productOf } from "@/components/studio/catalogue";
import { z } from "zod";

/**
 * An order as the server reads it. The price of each line is counted
 * again here from the catalogue, the same recipes the studio prices
 * from, so what is charged is what the studio showed and no price is
 * taken from the browser's word. A piece designed in the studio has no
 * catalogue line: its recipe comes with it, is checked against how the
 * pieces are made, and is priced from its panels the way the studio
 * priced it.
 */
export type LineIn = {
  productId: string;
  name: string;
  price: number;
  design?: DesignRecipe | undefined;
};
/** a designed piece's line: it is not in the catalogue */
export const DESIGN_LINE = "design";
export type Priced = { productId: string; name: string; sgd: number };

/** an order number: FN- and three to ten capitals or digits */
export const OrderId = z.string().regex(/^FN-[A-Z0-9]{3,10}$/);

const DIGITS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** a new order number from the server: FN-, the day's minute in base
    36 (so numbers read in order) and three random characters, none
    easily mistaken for another; a clash is retried by the route */
export const orderNumber = (now = Date.now()) => {
  const minute = Math.floor(now / 60_000)
    .toString(36)
    .toUpperCase()
    .slice(-4);
  let tail = "";
  for (let i = 0; i < 3; i++) tail += DIGITS[randomInt(DIGITS.length)];
  return `FN-${minute}${tail}`;
};

/** the lines priced from the catalogue, or the piece that is not in it */
export function priceLines(
  lines: LineIn[],
):
  | { ok: true; lines: Priced[]; total: number }
  | { ok: false; unknown: string } {
  const out: Priced[] = [];
  for (const l of lines) {
    if (l.design) {
      if (checkRecipe(l.design).length > 0)
        return { ok: false, unknown: l.name };
      out.push({
        productId: DESIGN_LINE,
        name: l.design.name,
        sgd: designOf(l.design).price,
      });
      continue;
    }
    const p = productOf(l.productId);
    if (!p) return { ok: false, unknown: l.productId };
    out.push({ productId: p.id, name: p.name, sgd: p.price });
  }
  return { ok: true, lines: out, total: out.reduce((t, l) => t + l.sgd, 0) };
}

export { canMove, type OrderStatus, STATUS_NAMES } from "./order-status";
