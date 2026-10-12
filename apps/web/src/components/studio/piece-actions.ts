"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetGroup, AssetNode } from "./assets-data";
import { products } from "./catalogue";
import { describeItem } from "./generation-store";
import {
  footprint,
  LABEL_MAX,
  turnAbout,
  turned,
  type PieceProps,
} from "./piece-detail";
import { explainPlan, travel } from "./plan-explain";
import { healthOf, type Issue, type Room } from "./room-health";
import {
  againstWall,
  gapOf,
  layoutPlans,
  layoutRoom,
  type Placed,
} from "./room-layout";
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
import { inRoom, noteStanding, propsOf, useScene } from "./scene-store";
import { useStudio } from "./studio-store";
import { partOutline } from "./part-outline";
import { usePartStore, type PartBuilt } from "./part-store";

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
  let plans: ReturnType<typeof layoutPlans> | undefined;
  return {
    room,
    props,
    laid,
    /** the four layouts, laid when first read: only the planner shows
        them, and a drag read the room again at every step */
    get plans() {
      return (plans ??= layoutPlans(named, room, laid, spec.room));
    },
  };
};

/**
 * A room's reading: what stands in it and where, its findings against
 * its rules (the room's own standing in the flat first), the pieces
 * standing over another, and its four layouts, each costed and
 * explained, with the one Eva would pick.
 */
const readRoom = (
  spec: RoomSpec,
  rooms: RoomSpec[],
  joins: Join[],
  groups: AssetGroup[],
  overrides: Record<string, Partial<PieceProps>>,
  builtParts: Record<string, PartBuilt>,
) => {
  const firstId = rooms[0]!.id;
  const { rules } = spec;
  // what stands in this room: the pieces and the room items, never the
  // architecture (that is the room itself); a hidden piece keeps its
  // place in the rows but is not drawn
  const pieces = groups
    .flatMap((g) => g.items)
    .filter(
      (n) =>
        n.kind !== "fixed" && inRoom(overrides[n.id] ?? {}, spec.id, firstId),
    );
  const read = layoutsOf(spec, joins, pieces, overrides);
  const { room, props, laid } = read;
  const spots = new Map(laid.map((s, i) => [pieces[i]!.id, s]));
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
  // priorities and explained: what each would leave and move; worked
  // out when first read (the planner's panel), not at every reading
  const planAll = () => {
    const plans = read.plans.map((plan) => {
      const e = explainPlan(
        plan.id,
        plan.places,
        laid,
        pieces.map((n) => ({
          id: n.id,
          name: n.name,
          props: props.get(n.id)!,
        })),
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
            p.x === s.x &&
            p.y === s.y &&
            p.rotation === props.get(n.id)!.rotation
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
    return { plans, pick, tied };
  };
  let planning: ReturnType<typeof planAll> | undefined;
  const planned = () => (planning ??= planAll());
  return {
    pieces,
    room,
    props,
    spots,
    issues,
    clashes,
    get plans() {
      return planned().plans;
    },
    get pick() {
      return planned().pick;
    },
    get tied() {
      return planned().tied;
    },
  };
};
type Reading = ReturnType<typeof readRoom>;

/** each room's last reading and what it was read from: the plan, the
    3D stage, the panels and the small views each ask for a room's
    reading, and a change in the stores reads it once for all of them
    (the findings' fixes alone took half a second a pick, read twenty
    times over) */
const readings = new Map<
  string,
  { from: readonly unknown[]; reading: Reading }
>();
const readingOf = (...from: Parameters<typeof readRoom>): Reading => {
  const [spec, rooms] = from;
  const kept = readings.get(spec.id);
  if (kept && kept.from.every((v, i) => v === from[i])) return kept.reading;
  const reading = readRoom(...from);
  readings.set(spec.id, { from, reading });
  // a room taken out of the flat leaves no reading behind
  for (const id of readings.keys())
    if (!rooms.some((r) => r.id === id)) readings.delete(id);
  return reading;
};

/**
 * What a piece on the stage can do, shared by the plan (DOM) and the
 * 3D scene: with Select a click picks it everywhere; with Inspect a
 * click also raises two actions over it, Details (the piece alone, and
 * the Detail tab) and Label (for Eva, five at a time). A piece in focus
 * stands alone. The same hook reads the room's health against its rules
 * and lays the room out four ways for the plan's Layouts. Which piece
 * is picked is not read here: a pick draws again only what shows it
 * (`useScene`'s `selectedId`), not every view of every room.
 */
export function usePieceActions(roomId?: string) {
  const groups = useScene((s) => s.groups);
  const overrides = useScene((s) => s.overrides);
  const labels = useScene((s) => s.labels);
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
  const joins = useRoom((s) => s.joins);
  const reading = useMemo(
    () => readingOf(spec, rooms, joins, groups, overrides, builtParts),
    [spec, rooms, joins, groups, overrides, builtParts],
  );
  const { pieces, room, props, spots, issues, clashes } = reading;
  // the store holds the laid-out pieces here before any one of them is
  // changed, so a move never shifts the rest
  useEffect(() => {
    if (!readOnly) noteStanding(spec.id, spots);
  });
  // a piece in focus stands alone: in its own room, and the other
  // rooms show nothing while it does
  const items = groups.flatMap((g) => g.items);
  const focus = pieces.find((n) => n.id === focusId) ?? null;
  const elsewhere = !focus && items.some((n) => n.id === focusId);
  const shown = focus
    ? [focus]
    : elsewhere
      ? []
      : pieces.filter((n) => !props.get(n.id)!.hidden);

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

  /** a turn to `rotation`, about the piece's middle: its box on the
      plan changes with the turn, its middle stays */
  const turnTo = (n: AssetNode, rotation: number) =>
    setProps(n.id, turnAbout(spots.get(n.id)!, props.get(n.id)!, rotation));
  /** a quarter turn, in place */
  const turn = (n: AssetNode) => turnTo(n, turned(props.get(n.id)!.rotation));
  /** the piece's back to the wall nearest it, flush to that wall */
  const toWall = (n: AssetNode) => {
    const to = againstWall(spots.get(n.id)!, props.get(n.id)!, room.outline);
    if (to) setProps(n.id, to);
  };
  /** a second of the piece beside it: to its east when the room has
      the space, else to its south, else over it a little */
  const duplicate = (n: AssetNode) => {
    const at = spots.get(n.id)!;
    const f = footprint(props.get(n.id)!);
    const gap = 100;
    const to =
      at.x + 2 * f.w + gap <= room.W
        ? { x: at.x + f.w + gap, y: at.y }
        : at.y + 2 * f.d + gap <= room.D
          ? { x: at.x, y: at.y + f.d + gap }
          : { x: at.x + gap * 2, y: at.y + gap * 2 };
    useScene.getState().duplicate(n.id, to);
  };

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
    /** the room laid out four ways, and which Eva would pick, worked
        out when first read */
    get plans() {
      return reading.plans;
    },
    get pick() {
      return reading.pick;
    },
    /** more than one layout costs the same: the pick is the one that moves least */
    get tied() {
      return reading.tied;
    },
    /** stand every piece as a layout says, one undo step */
    apply: (plan: Reading["plans"][number]) =>
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
    tool,
    turn,
    turnTo,
    toWall,
    duplicate,
    remove: (n: AssetNode) => useScene.getState().removeNode(n.id),
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
