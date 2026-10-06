import { describe, expect, it } from "vitest";
import { products } from "@/components/studio/catalogue";
import { canMove, priceLines } from "./orders";

describe("an order's lines", () => {
  it("are priced from the catalogue, whatever the browser said", () => {
    const bookwall = products.find((p) => p.id === "bookwall")!;
    const priced = priceLines([
      { productId: "bookwall", name: "Bookwall", price: 1 },
    ]);
    expect(priced.ok).toBe(true);
    if (priced.ok) {
      expect(priced.lines[0]!.sgd).toBe(bookwall.price);
      expect(priced.total).toBe(bookwall.price);
    }
  });
  it("refuse a piece the catalogue does not have", () => {
    const priced = priceLines([{ productId: "nope", name: "?", price: 5 }]);
    expect(priced).toEqual({ ok: false, unknown: "nope" });
  });
});

describe("an order's moves", () => {
  it("go forward only", () => {
    expect(canMove("pending_payment", "paid")).toBe(true);
    expect(canMove("pending_payment", "cancelled")).toBe(true);
    expect(canMove("paid", "refunded")).toBe(true);
    expect(canMove("paid", "paid")).toBe(false);
    expect(canMove("cancelled", "paid")).toBe(false);
    expect(canMove("paid", "cancelled")).toBe(false);
  });
});
