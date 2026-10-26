"use client";

import { useLayoutEffect, useRef } from "react";
import type { RectAreaLight } from "three";
import { RectAreaLightTexturesLib } from "three/examples/jsm/lights/RectAreaLightTexturesLib.js";
import { RectAreaLightNode } from "three/webgpu";
import { type Pane, WINDOW_LIGHT } from "./window-light";
import { devNumber } from "./dev-flags";

/**
 * The windows' soft light in the live view (window-light.ts lays it
 * out): an area light in each lit window's opening. The renderer's area
 * lights need their lookup tables once, before the first frame that has
 * one; they are handed over when this module is first drawn.
 */
let tables = false;
const withTables = () => {
  if (tables) return;
  RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
  tables = true;
};

/** a light not in use: dark and a hair across, so the count, and with it
    every shader, stays as it is */
const UNUSED = 0.01;

function WindowLight({
  pane,
  colour,
  intensity,
}: {
  pane: Pane | undefined;
  colour: string;
  intensity: number;
}) {
  const ref = useRef<RectAreaLight>(null);
  useLayoutEffect(() => {
    const l = ref.current;
    if (!l) return;
    if (!pane) {
      l.position.set(0, -10, 0);
      return;
    }
    const [x, y, z] = pane.at;
    l.position.set(x, y, z);
    // an area light shines down its -z: turned to look into the room
    l.lookAt(x + pane.facing[0], y, z + pane.facing[1]);
  }, [pane]);
  return (
    <rectAreaLight
      ref={ref}
      color={colour}
      intensity={pane ? intensity : 0}
      width={pane?.width ?? UNUSED}
      height={pane?.height ?? UNUSED}
    />
  );
}

export function WindowLights({
  panes,
  count,
  evening,
}: {
  panes: readonly Pane[];
  /** the lights the shaders carry (window-light.ts's lightCount) */
  count: number;
  evening: boolean;
}) {
  withTables();
  const look = evening ? WINDOW_LIGHT.evening : WINDOW_LIGHT.day;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <WindowLight
          key={i}
          pane={panes[i]}
          colour={look.colour}
          intensity={
            evening ? look.intensity : (devNumber("win") ?? look.intensity)
          }
        />
      ))}
    </>
  );
}
