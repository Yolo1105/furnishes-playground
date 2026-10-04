"use client";

import { useState } from "react";
import type { AssetNode } from "./assets-data";
import { LABEL_MAX } from "./piece-detail";
import { useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * What a piece on the stage can do, shared by the plan (DOM) and the
 * 3D scene: with Select a click picks it everywhere; with Inspect a
 * click also raises two actions over it, Details (the piece alone, and
 * the Detail tab) and Label (for Eva, five at a time). A piece in focus
 * stands alone.
 */
export function usePieceActions() {
  const items = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const labels = useScene((s) => s.labels);
  const selectedId = useScene((s) => s.selectedId);
  const { select, toggleLabel } = useScene.getState();
  const tool = useStudio((s) => s.tool);
  const focusId = useStudio((s) => s.focusId);
  const { setFocus, setPanelTab } = useStudio.getState();
  const [actionsFor, setActionsFor] = useState<string | null>(null);

  const pieces = items.filter((n) => n.kind === "piece");
  const focus = pieces.find((n) => n.id === focusId) ?? null;
  const shown = focus ? [focus] : pieces;

  const onPick = (n: AssetNode) => {
    if (tool === "inspect") {
      select(n.id, false);
      setActionsFor((cur) => (cur === n.id ? null : n.id));
    } else {
      select(n.id);
      setActionsFor(null);
    }
  };
  const details = (n: AssetNode) => {
    setFocus(n.id);
    setPanelTab("detail");
    setActionsFor(null);
  };
  const labelOf = (n: AssetNode) => labels.indexOf(n.id);
  const labelsFull = (n: AssetNode) =>
    !labels.includes(n.id) && labels.length >= LABEL_MAX;

  return {
    pieces,
    focus,
    shown,
    overrides,
    selectedId,
    tool,
    actionsFor,
    onPick,
    details,
    toggleLabel,
    labelOf,
    labelsFull,
    leaveFocus: () => setFocus(null),
  };
}
