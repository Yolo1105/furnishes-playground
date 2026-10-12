"use client";

import type { Opening } from "./room-data";
import type { Point } from "./room-templates";
import type { RoomSpec } from "./room-store";
import {
  itemCentre,
  useWallItems,
  WALL_ITEMS,
  type WallItem,
  type WallItemKind,
} from "./wall-items";

/**
 * A room's wall items on the plan, against the inside face of their
 * walls, in the room's own millimetres. An outlet is drawn as a drawing
 * marks one: a small circle on the wall with two lines through it; the
 * rest as their depth off the wall, a high one (the air-con, the water
 * heater) dashed, as a plan draws what is overhead. Each carries its
 * name for the pointer.
 */
const OUTLET_R = 80;
/** the least depth an item is drawn at, so a picture still shows, mm */
const MIN_DEPTH = 50;
const HIGH: WallItemKind[] = ["aircon", "water-heater", "drying-rack"];

export function PlanWallItems({
  shell,
  items,
}: {
  shell: {
    W: number;
    D: number;
    outline: readonly Point[];
    openings: readonly Opening[];
  };
  items: readonly WallItem[];
}) {
  return (
    <g className="plan-wall-items" aria-hidden="true">
      {items.map((it) => {
        const c = itemCentre(shell, it);
        const spec = WALL_ITEMS[it.kind];
        const horizontal = it.wall === "north" || it.wall === "south";
        // into the room from the wall's face
        const sign = it.wall === "north" || it.wall === "west" ? 1 : -1;
        const x = horizontal ? c.centre : c.at;
        const y = horizontal ? c.at : c.centre;
        if (it.kind === "outlet") {
          const cx = horizontal ? x : x + sign * OUTLET_R;
          const cy = horizontal ? y + sign * OUTLET_R : y;
          const l = OUTLET_R * 0.55;
          return (
            <g key={it.id} className="plan-outlet" data-wall={it.wall}>
              <title>{spec.label}</title>
              <circle cx={cx} cy={cy} r={OUTLET_R} />
              {horizontal ? (
                <>
                  <line
                    x1={cx - l}
                    y1={cy - l / 2}
                    x2={cx + l}
                    y2={cy - l / 2}
                  />
                  <line
                    x1={cx - l}
                    y1={cy + l / 2}
                    x2={cx + l}
                    y2={cy + l / 2}
                  />
                </>
              ) : (
                <>
                  <line
                    x1={cx - l / 2}
                    y1={cy - l}
                    x2={cx - l / 2}
                    y2={cy + l}
                  />
                  <line
                    x1={cx + l / 2}
                    y1={cy - l}
                    x2={cx + l / 2}
                    y2={cy + l}
                  />
                </>
              )}
            </g>
          );
        }
        const depth = Math.max(MIN_DEPTH, spec.depth);
        const w = horizontal ? spec.width : depth;
        const h = horizontal ? depth : spec.width;
        const rx = horizontal ? x - spec.width / 2 : sign > 0 ? x : x - depth;
        const ry = horizontal ? (sign > 0 ? y : y - depth) : y - spec.width / 2;
        return (
          <rect
            key={it.id}
            className="plan-wall-item"
            data-kind={it.kind}
            data-high={HIGH.includes(it.kind)}
            x={rx}
            y={ry}
            width={w}
            height={h}
          >
            <title>{spec.label}</title>
          </rect>
        );
      })}
    </g>
  );
}

/** a room's wall items as they stand (its own, or the suggestion) */
export function RoomWallItems({
  spec,
  shell,
}: {
  spec: RoomSpec;
  shell: Parameters<typeof PlanWallItems>[0]["shell"];
}) {
  return <PlanWallItems shell={shell} items={useWallItems(spec)} />;
}
