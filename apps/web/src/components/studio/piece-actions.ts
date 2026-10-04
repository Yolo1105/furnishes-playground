"use client";

import { useState } from "react";
import type { AssetNode } from "./assets-data";
import { footprint, LABEL_MAX, turned } from "./piece-detail";
import { healthOf, type Issue } from "./room-health";
import { layoutRoom } from "./room-layout";
import { useRoom } from "./room-store";
import { propsOf, useScene, useTopLevel } from "./scene-store";
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
  const { select, toggleLabel, setProps } = useScene.getState();
  const tool = useStudio((s) => s.tool);
  const focusId = useStudio((s) => s.focusId);
  const { setFocus, setPanelTab } = useStudio.getState();
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const W = useRoom((s) => s.width);
  const D = useRoom((s) => s.depth);
  const door = useRoom((s) => s.door);
  const doorOffset = useRoom((s) => s.doorOffset);
  const window_ = useRoom((s) => s.window);
  const windowWidth = useRoom((s) => s.windowWidth);

  // what stands on the stage: the pieces and the room items, never the
  // architecture (that is the room itself); a hidden piece keeps its
  // place in the rows but is not drawn
  const pieces = items.filter((n) => n.kind !== "fixed");
  const props = new Map(pieces.map((n) => [n.id, propsOf(n, overrides)]));
  const spots = new Map(
    layoutRoom(
      pieces.map((n) => ({ ...props.get(n.id)!, name: n.name })),
      W,
      D,
    ).map((s, i) => [pieces[i]!.id, s]),
  );
  const focus = pieces.find((n) => n.id === focusId) ?? null;
  const shown = focus
    ? [focus]
    : pieces.filter((n) => !props.get(n.id)!.hidden);
  const issues: Issue[] = healthOf(
    pieces
      .filter((n) => !props.get(n.id)!.hidden)
      .map((n) => {
        const p = props.get(n.id)!;
        const f = footprint(p);
        const s = spots.get(n.id)!;
        return {
          id: n.id,
          name: n.name,
          x: s.x,
          y: s.y,
          w: f.w,
          d: f.d,
          h: p.height,
        };
      }),
    { W, D, door, doorOffset, window: window_, windowWidth },
  );
  const clashes = new Set(
    issues
      .filter((i) => i.kind === "overlap")
      .flatMap((i) => [i.pieceId, i.otherId!]),
  );

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

  /** a quarter turn, in place */
  const turn = (n: AssetNode) =>
    setProps(n.id, { rotation: turned(props.get(n.id)!.rotation) });

  return {
    pieces,
    focus,
    shown,
    overrides,
    /** each piece's properties, by id */
    props,
    /** where each piece stands, by id, mm */
    spots,
    /** the pieces standing over another */
    clashes,
    /** the planner's findings, each with a Fix where one exists */
    issues,
    /** move a piece to its Fix, one undo step */
    fix: (i: Issue) => i.fix && setProps(i.pieceId, i.fix),
    room: { W, D },
    selectedId,
    tool,
    turn,
    actionsFor,
    onPick,
    details,
    toggleLabel,
    labelOf,
    labelsFull,
    leaveFocus: () => setFocus(null),
  };
}
