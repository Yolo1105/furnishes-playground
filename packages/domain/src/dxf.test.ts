import { describe, expect, it } from "vitest";
import { dxfOf } from "./dxf";
import { backGroove, hingeCups, middleCutout, systemHoles } from "./features";

const side = { length: 400, width: 740 };

describe("dxfOf", () => {
  it("draws the outline and the machining on their layers, in millimetres", () => {
    const dxf = dxfOf({
      ...side,
      features: [
        ...systemHoles(side),
        backGroove(side),
        middleCutout(side),
        ...hingeCups(side),
      ],
    });
    expect(dxf.startsWith("0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4")).toBe(
      true,
    );
    expect(dxf.trim().endsWith("0\nEOF")).toBe(true);
    const count = (s: string) => dxf.split(s).length - 1;
    expect(count("0\nPOLYLINE\n8\nOUTLINE")).toBe(1);
    expect(count("0\nCIRCLE\n8\nHOLES_13")).toBe(
      systemHoles(side).length + hingeCups(side).length,
    );
    expect(count("0\nPOLYLINE\n8\nGROOVES_10")).toBe(1);
    expect(count("0\nPOLYLINE\n8\nCUTOUTS")).toBe(1);
    // the outline's far corner is the panel's size
    expect(dxf).toContain("10\n400.00\n20\n740.00");
  });
  it("mirrors a feature on the back face across the length", () => {
    const [cup] = hingeCups(side);
    const dxf = dxfOf({ ...side, features: [cup!] });
    expect(dxf).toContain(
      `10\n${(side.length - cup!.u).toFixed(2)}\n20\n${cup!.v.toFixed(2)}`,
    );
  });
});
