"use client";

import { useEffect, useState } from "react";
import type { AssetNode } from "./assets-data";
import { products } from "./catalogue";
import { describeItem } from "./generation-store";
import { footprint, LABEL_MAX, turned, type PieceProps } from "./piece-detail";
import { explainPlan, travel } from "./plan-explain";
import { healthOf, type Issue, type Room } from "./room-health";
import { gapOf, layoutPlans, layoutRoom, type Placed } from "./room-layout";
import { MUST_HAVE_CHOICES } from "./room-data";
import {
  footprintOf,
  openingsOf,
  overlapText,
  roomOverlaps,
  useRoom,
  type Join,
  type RoomSpec,
} from "./room-store";
import {
  inRoom,
  noteStanding,
  propsOf,
  useScene,
  useTopLevel,
} from "./scene-store";
import { useStudio } from "./studio-store";
import { partOutline } from "./part-outline";
import { usePartStore } from "./part-store";

/**
 * The room as the planner reads it, where its pieces stand, and the
 * four layouts of them: a pure reading, so Eva's store can lay a room
 * out the same way the hook below shows it.
 */
export const layoutsOf = (
  spec: RoomSpec,
  joins: Join[],
  pieces: AssetNode[],
  overrides: Record<string, Partial<PieceProps>>,
) => {
  const room: Room = {
    W: spec.width,
    D: spec.depth,
    outline: footprintOf(spec),
    openings: openingsOf({ joins }, spec),
    rules: spec.rules,
    thickness: spec.thickness,
  };
  const props = new Map(pieces.map((n) => [n.id, propsOf(n, overrides)]));
  const named = pieces.map((n) => ({ ...props.get(n.id)!, name: n.name }));
  const laid = layoutRoom(named, room, gapOf(spec.rules));
  return {
    room,
    props,
    laid,
    plans: layoutPlans(named, room, laid, spec.room),
  };
};

/**
 * What a piece on the stage can do, shared by the plan (DOM) and the
 * 3D scene: with Select a click picks it everywhere; with Inspect a
 * click also raises two actions over it, Details (the piece alone, and
 * the Detail tab) and Label (for Eva, five at a time). A piece in focus
 * stands alone. The same hook reads the room's health against its rules
 * and lays the room out four ways for the plan's Layouts.
 */
export function usePieceActions(roomId?: string) {
  const items = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const labels = useScene((s) => s.labels);
  const selectedId = useScene((s) => s.selectedId);
  const { select, toggleLabel, setProps, placeAll, addProduct, addItem } =
    useScene.getState();
  const readOnly = useStudio((s) => s.readOnly);
  // the parts as built, for their real outlines on the plan
  const builtParts = usePartStore((s) => s.built);
  // a shared room reads as Inspect, with nothing offered on a click
  const tool = useStudio((s) => (readOnly ? "inspect" : s.tool));
  const focusId = useStudio((s) => s.focusId);
  const { setFocus, setPanelTab } = useStudio.getState();
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  // the room asked for, else the active one
  const rooms = useRoom((s) => s.rooms);
  const activeId = useRoom((s) => s.activeId);
  const spec = rooms.find((r) => r.id === (roomId ?? activeId)) ?? rooms[0]!;
  const firstId = rooms[0]!.id;
  const joins = useRoom((s) => s.joins);
  const { rules } = spec;
  // what stands in this room: the pieces and the room items, never the
  // architecture (that is the room itself); a hidden piece keeps its
  // place in the rows but is not drawn
  const pieces = items.filter(
    (n) =>
      n.kind !== "fixed" && inRoom(overrides[n.id] ?? {}, spec.id, firstId),
  );
  const read = layoutsOf(spec, joins, pieces, overrides);
  const { room, props, laid } = read;
  const spots = new Map(laid.map((s, i) => [pieces[i]!.id, s]));
  // the store holds the laid-out pieces here before any one of them is
  // changed, so a move never shifts the rest
  useEffect(() => {
    if (!readOnly) noteStanding(spec.id, spots);
  });
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
      const mesh = n.part ? builtParts[n.id]?.mesh : undefined;
      return [
        {
          id: n.id,
          name: n.name,
          x: at.x,
          y: at.y,
          ...f,
          h: p.height,
          own: { w: p.width, d: p.depth, rotation: at.rotation },
          poly: mesh ? partOutline(mesh) : undefined,
        },
      ];
    });
  const now = (i: number): Placed => ({
    ...laid[i]!,
    rotation: props.get(pieces[i]!.id)!.rotation,
  });
  // the room's own standing in the flat comes first: a room over
  // another is wrong before anything in it is
  const issues: Issue[] = [
    ...roomOverlaps(rooms, spec.id).map((other): Issue => ({
      kind: "rooms",
      text: overlapText(rooms, spec, other),
      pieceId: null,
      roomId: other.id,
    })),
    ...healthOf(boxes(now), room),
  ];
  const clashes = new Set(
    issues
      .filter((i) => i.kind === "overlap")
      .flatMap((i) => [i.pieceId!, i.otherId!]),
  );
  // the four layouts, each read against the same rules, costed by the
  // priorities and explained: what each would leave and move
  const plans = read.plans.map((plan) => {
    const e = explainPlan(
      plan.id,
      plan.places,
      laid,
      pieces.map((n) => ({ id: n.id, name: n.name, props: props.get(n.id)! })),
      healthOf(
        boxes((i) => plan.places[i]),
        room,
      ),
      rules,
    );
    return {
      ...plan,
      ...e,
      findings: e.issues.length,
      applied: pieces.every((n, i) => {
        const p = plan.places[i]!;
        const s = laid[i]!;
        return (
          p.x === s.x && p.y === s.y && p.rotation === props.get(n.id)!.rotation
        );
      }),
    };
  });
  // the lowest cost; when costs tie, the layout that moves the least
  const pick = plans.reduce((best, p, i) => {
    const b = plans[best]!;
    if (p.score < b.score) return i;
    if (p.score === b.score && travel(p.moves) < travel(b.moves)) return i;
    return best;
  }, 0);
  const tied = plans.filter((p) => p.score === plans[pick]!.score).length > 1;

  const onPick = (n: AssetNode) => {
    // a piece picked in another room brings that room to the front
    if (spec.id !== activeId) useRoom.getState().setActive(spec.id);
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
      ? addProduct(product, spec.id)
      : addItem(
          describeItem(key.replace(/^\w/, (ch) => ch.toUpperCase())),
          spec.id,
        );
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
      if (i.kind === "rooms") useRoom.getState().settleRoom(spec.id);
      else if (i.add) add(i.add);
      else if (i.fix && i.pieceId) setProps(i.pieceId, i.fix);
    },
    /** the room laid out four ways, and which Eva would pick */
    plans,
    pick,
    /** more than one layout costs the same: the pick is the one that moves least */
    tied,
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
    /** the room these pieces stand in */
    roomId: spec.id,
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
