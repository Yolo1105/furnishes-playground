/**
 * @furnishes/domain — the product model: the catalogue of Furnishes
 * recipes, the parts each is built from, the steps to build it and its
 * price, an estimate counted from those parts. Framework-free; the
 * studio and the server both read it.
 */
export const DOMAIN_PACKAGE = "@furnishes/domain" as const;

/** Millimetres are the one unit the domain speaks. */
export type Millimetres = number;

export const mm = (value: number): Millimetres => Math.round(value);

export * from "./catalogue";
export * from "./parts";
export * from "./steps";
export * from "./price";
export * from "./panels";
export * from "./carcass";
export * from "./features";
export * from "./cutlist";
export * from "./dxf";
