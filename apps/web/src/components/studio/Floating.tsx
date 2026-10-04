"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * A menu placed on screen from inside a glass bar: the bar's blur makes
 * a stacking context of its own, so the menu is rendered at the end of
 * the body instead, and its fixed position puts it where the bar says.
 */
export function Floating({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
