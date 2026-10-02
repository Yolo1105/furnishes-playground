/**
 * @furnishes/domain — the product model.
 *
 * Project → Room → Scheme → FurnitureInstance → Component, with the six
 * instance attributes (type, source, ownership, editability,
 * purchasability, lock), candidates vs decisions, and Eva memory axes.
 *
 * Nothing is modelled yet: this package exists so the workspace, type
 * checking and tests are wired end to end before any domain code lands.
 */
export const DOMAIN_PACKAGE = "@furnishes/domain" as const;

/** Millimetres are the one unit the domain speaks. */
export type Millimetres = number;

export const mm = (value: number): Millimetres => Math.round(value);
