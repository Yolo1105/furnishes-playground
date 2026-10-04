"use client";

import { useState } from "react";
import type { AssetNode } from "./assets-data";
import { products } from "./catalogue";
import { describeItem } from "./generation-store";
import { footprint, LABEL_MAX, turned, type PieceProps } from "./piece-detail";
import { healthOf, type Issue, type Room } from "./room-health";
import { gapOf, layoutPlans, layoutRoom, type Placed } from "./room-layout";
import { MUST_HAVE_CHOICES } from "./room-data";
import { footprintOf, useRoom } from "./room-store";
import { propsOf, useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * What a piece on the stage can do, shared by the plan (DOM) and the
 * 3D scene: with Select a click picks it everywhere; with Inspect a
 * click also raises two actions over it, Details (the piece alone, and
 * the Detail tab) and Label (for Eva, five at a time). A piece in focus
 * stands alone. The same hook reads the room's health against its rules
 * and lays the room out three ways for the plan's Layouts.
 */
export function usePieceActions() {
  const items = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const labels = useScene((s) => s.labels);
  const selectedId = useScene((s) => s.selectedId);
  const { select, toggleLabel, setProps, placeAll, addProduct, addItem } =
    useScene.getState();
  const readOnly = useStudio((s) => s.readOnly);
  // a shared room reads as Inspect, with nothing offered on a click
  const tool = useStudio((s) => (readOnly ? "inspect" : s.tool));
  const focusId = useStudio((s) => s.focusId);
  const { setFocus, setPanelTab } = useStudio.getState();
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const W = useRoom((s) => s.width);
  const D = useRoom((s) => s.depth);
  const door = useRoom((s) => s.door);
  const doorOffset = useRoom((s) => s.doorOffset);
  const window_ = useRoom((s) => s.window);
  const windowWidth = useRoom((s) => s.windowWidth);
  const rules = useRoom((s) => s.rules);
  const drawn = useRoom((s) => s.drawn);
  const template = useRoom((s) => s.template);
  const cells = useRoom((s) => s.cells);
  const room: Room = {
    W,
    D,
    outline: footprintOf({ drawn, template, cells, width: W, depth: D }),
    door,
    doorOffset,
    window: window_,
    windowWidth,
    rules,
  };

  // what stands on the stage: the pieces and the room items, never the
  // architecture (that is the room itself); a hidden piece keeps its
  // place in the rows but is not drawn
  const pieces = items.filter((n) => n.kind !== "fixed");
  const props = new Map(pieces.map((n) => [n.id, propsOf(n, overrides)]));
  const named = pieces.map((n) => ({ ...props.get(n.id)!, name: n.name }));
  const laid = layoutRoom(named, room, gapOf(rules));
  const spots = new Map(laid.map((s, i) => [pieces[i]!.id, s]));
  const focus = pieces.find((n) => n.id === focusId) ?? null;
  const shown = focus
    ? [focus]
    : pieces.filter((n) => !props.get(n.id)!.hidden);
  /** the pieces as boxes on the floor, standing as `where` says */
  const boxes = (where: (i: number) => Placed | undefined) =>
    pieces.flatMap((n, i) => {
      const p = props.get(n.id)!;
      const at = where(i);
      if (p.hidden || !at) return [];
      const f = footprint({ ...p, rotation: at.rotation });
      return [
        {
          id: n.id,
          name: n.name,
          x: at.x,
          y: at.y,
          ...f,
          h: p.height,
          own: { w: p.width, d: p.depth, rotation: at.rotation },
        },
      ];
    });
  const now = (i: number): Placed => ({
    ...laid[i]!,
    rotation: props.get(pieces[i]!.id)!.rotation,
  });
  const issues: Issue[] = healthOf(boxes(now), room);
  const clashes = new Set(
    issues
      .filter((i) => i.kind === "overlap")
      .flatMap((i) => [i.pieceId!, i.otherId!]),
  );
  // the three layouts, each read against the same rules
  const plans = layoutPlans(named, room, laid).map((plan) => ({
    ...plan,
    findings: healthOf(
      boxes((i) => plan.places[i]),
      room,
    ).filter((i) => i.kind !== "missing").length,
    applied: pieces.every((n, i) => {
      const p = plan.places[i]!;
      const s = laid[i]!;
      return (
        p.x === s.x && p.y === s.y && p.rotation === props.get(n.id)!.rotation
      );
    }),
  }));
  const pick = plans.reduce(
    (best, p, i) => (p.findings < plans[best]!.findings ? i : best),
    0,
  );

  const onPick = (n: AssetNode) => {
    if (readOnly) select(n.id, false);
    else if (tool === "inspect") {
      select(n.id, false);
      setActionsFor((cur) => (cur === n.id ? null : n.id));
    } else {
      select(n.id);
      setActionsFor(null);
    }
  };
  /** a long press under a finger: the piece's actions, whatever the tool */
  const hold = (n: AssetNode) => {
    select(n.id, false);
    if (!readOnly) setActionsFor(n.id);
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

  /** what the room is missing goes in: the catalogue piece that is it,
      or a room item of that name */
  const add = (key: string) => {
    const c = MUST_HAVE_CHOICES.find((x) => x.key === key);
    const product = c && products.find((p) => c.match.test(p.name));
    const id = product
      ? addProduct(product)
      : addItem(describeItem(key.replace(/^\w/, (ch) => ch.toUpperCase())));
    select(id);
  };

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
    /** the planner's findings, each with a Fix or an Add where one exists */
    issues,
    /** move a piece to its Fix, or add what is missing: one undo step */
    fix: (i: Issue) => {
      if (i.add) add(i.add);
      else if (i.fix && i.pieceId) setProps(i.pieceId, i.fix);
    },
    /** the room laid out three ways, and which Eva would pick */
    plans,
    pick,
    /** stand every piece as a layout says, one undo step */
    apply: (plan: (typeof plans)[number]) =>
      placeAll(
        Object.fromEntries(
          pieces.map((n, i) => [
            n.id,
            plan.places[i]! satisfies Partial<PieceProps>,
          ]),
        ),
      ),
    room,
    selectedId,
    tool,
    turn,
    actionsFor,
    onPick,
    hold,
    details,
    toggleLabel,
    labelOf,
    labelsFull,
    leaveFocus: () => setFocus(null),
  };
}
