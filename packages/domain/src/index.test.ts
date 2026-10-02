import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DOMAIN_PACKAGE, mm } from "./index.js";

describe("@furnishes/domain", () => {
  it("names itself", () => {
    expect(DOMAIN_PACKAGE).toBe("@furnishes/domain");
  });

  it("mm() always returns an integer", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (v) => {
        expect(Number.isInteger(mm(v))).toBe(true);
      }),
    );
  });
});
