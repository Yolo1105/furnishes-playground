"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import { type PerspectiveCamera, Quaternion, Vector3 } from "three";

/** the most device pixels a CSS pixel is drawn with: a Retina screen's
    two drew four times the pixels through every pass for a picture the
    temporal pass smooths anyway */
export const SHARP_MAX = 1.5;
/** the pixels a CSS pixel is drawn with while the camera moves */
const MOVING = 1;
/** how long after the camera's last move a frame is asked for to see
    whether it still stands, ms */
const STILL_MS = 200;

/** whether the camera moved within the last moment: the probes' bake
    waits while it does, so a drag is not drawn behind it */
const motion = { moving: false };
export const cameraMoving = () => motion.moving;

/** the device pixels a CSS pixel is drawn with when the camera is still */
export const sharpDpr = () =>
  Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    SHARP_MAX,
  );

/**
 * While the camera moves (an orbit, a glide, a pan, a walk), the picture
 * is drawn with one device pixel to a CSS pixel; once it stands, sharp
 * again. A moment after its last move a frame is asked for, and the
 * picture is drawn sharp only if the camera stood through it: a slow
 * device's frames come further apart than any pause, and a drag still
 * under way moves the camera again by that frame, so the picture is not
 * drawn sharp and soft by turns. The camera is read where it stands (its
 * place, turn and lens), not by its world matrix, which a frame draws.
 * The stage says which (`data-moving`), set without a render, as the
 * hover is. On a Retina screen a moving frame draws a quarter of the
 * pixels it did; on a screen of one device pixel to a CSS pixel nothing
 * changes but the bake's pause.
 */
export function LighterWhileMoving({
  stage,
}: {
  stage: RefObject<HTMLDivElement | null>;
}) {
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  // where the camera stood at the last frame that moved it
  const seen = useRef({ at: new Vector3(), turn: new Quaternion(), fov: 0 });
  const timer = useRef(0);
  // the pause is over: the next frame tells whether the camera stood
  const asking = useRef(false);
  useEffect(() => {
    stage.current?.setAttribute("data-moving", "false");
    return () => {
      window.clearTimeout(timer.current);
      motion.moving = false;
    };
  }, [stage]);
  useFrame(({ camera, viewport }) => {
    const was = seen.current;
    const fov = (camera as PerspectiveCamera).fov ?? 0;
    const moved =
      !camera.position.equals(was.at) ||
      !camera.quaternion.equals(was.turn) ||
      fov !== was.fov;
    const sharp = sharpDpr();
    if (!moved) {
      if (!asking.current) return;
      asking.current = false;
      motion.moving = false;
      stage.current?.setAttribute("data-moving", "false");
      if (sharp > MOVING) setDpr(sharp);
      // the bake and the temporal pass go on from here
      invalidate();
      return;
    }
    was.at.copy(camera.position);
    was.turn.copy(camera.quaternion);
    was.fov = fov;
    asking.current = false;
    if (!motion.moving) {
      motion.moving = true;
      stage.current?.setAttribute("data-moving", "true");
    }
    // the canvas's own dpr comes back whenever the stage draws again
    if (sharp > MOVING && viewport.dpr !== MOVING) setDpr(MOVING);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      asking.current = true;
      invalidate();
    }, STILL_MS);
  });
  return null;
}

/** a frame slower than this while the camera moves, ms, is a device the
    picture is too much for: 20 frames a second */
export const SLOW_MS = 50;
/** the frames read before the picture is judged */
const SAMPLES = 24;
/** how long after a lighter picture is chosen the frames are read
    again, ms: the new passes are built in that time */
const SETTLE_AFTER_MS = 3000;

/** the middle of the frame times read, ms */
export const medianOf = (xs: readonly number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * Reads the time between frames while the camera moves; when the middle
 * of two dozen is slower than `SLOW_MS`, the device is given a lighter
 * picture (`onSlow`, a tier down; Post.tsx's `tierBelow`). Only the
 * moving frames count: a still picture draws nothing to time.
 */
export function SlowFrames({ onSlow }: { onSlow: () => void }) {
  const times = useRef<number[]>([]);
  const prev = useRef(0);
  const quietUntil = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const gap = now - prev.current;
    prev.current = now;
    if (!motion.moving || now < quietUntil.current || gap > 1000) return;
    times.current.push(gap);
    if (times.current.length < SAMPLES) return;
    const slow = medianOf(times.current) > SLOW_MS;
    times.current = [];
    if (!slow) return;
    quietUntil.current = now + SETTLE_AFTER_MS;
    onSlow();
  });
  return null;
}
