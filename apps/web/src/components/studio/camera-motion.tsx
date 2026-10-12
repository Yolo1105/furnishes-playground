"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import { type PerspectiveCamera, Quaternion, Vector3 } from "three";

/** the most device pixels a CSS pixel is drawn with: a Retina screen's
    two drew four times the pixels through every pass for a picture the
    temporal pass smooths anyway. It stays as it is: a canvas resized
    while the camera moved was cleared and its passes built again, and
    the picture blinked */
export const SHARP_MAX = 1.5;
/** how long after the camera's last move it is taken to stand, ms */
const STILL_MS = 200;

/** whether the camera moved within the last moment: the probes' bake
    waits while it does, so a drag is not drawn behind it */
const motion = { moving: false };
export const cameraMoving = () => motion.moving;

/** the device pixels a CSS pixel is drawn with */
export const sharpDpr = () =>
  Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    SHARP_MAX,
  );

/**
 * Whether the camera is moving (an orbit, a glide, a pan, a walk), read
 * where it stands each frame (its place, turn and lens), and taken to
 * stand a moment after its last move. The stage says which
 * (`data-moving`), set without a render, as the hover is.
 */
export function CameraMotion({
  stage,
}: {
  stage: RefObject<HTMLDivElement | null>;
}) {
  // where the camera stood at the last frame that moved it
  const seen = useRef({ at: new Vector3(), turn: new Quaternion(), fov: 0 });
  const timer = useRef(0);
  useEffect(() => {
    stage.current?.setAttribute("data-moving", "false");
    return () => {
      window.clearTimeout(timer.current);
      motion.moving = false;
    };
  }, [stage]);
  useFrame(({ camera, invalidate }) => {
    const was = seen.current;
    const fov = (camera as PerspectiveCamera).fov ?? 0;
    if (
      camera.position.equals(was.at) &&
      camera.quaternion.equals(was.turn) &&
      fov === was.fov
    )
      return;
    was.at.copy(camera.position);
    was.turn.copy(camera.quaternion);
    was.fov = fov;
    if (!motion.moving) {
      motion.moving = true;
      stage.current?.setAttribute("data-moving", "true");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      motion.moving = false;
      stage.current?.setAttribute("data-moving", "false");
      // the bake goes on from here
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
/** how many times the picture is judged in all: at the opening (its
    glide moves the camera) and once more after a lighter tier is built;
    then it is left as it is, so a working session never sees its
    passes built again */
const JUDGEMENTS = 2;
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
 * moving frames count: a still picture draws nothing to time. It judges
 * twice at most, both early.
 */
export function SlowFrames({ onSlow }: { onSlow: () => void }) {
  const times = useRef<number[]>([]);
  const prev = useRef(0);
  const quietUntil = useRef(0);
  const judged = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const gap = now - prev.current;
    prev.current = now;
    if (judged.current >= JUDGEMENTS) return;
    if (!motion.moving || now < quietUntil.current || gap > 1000) return;
    times.current.push(gap);
    if (times.current.length < SAMPLES) return;
    const slow = medianOf(times.current) > SLOW_MS;
    times.current = [];
    judged.current += 1;
    if (!slow) {
      judged.current = JUDGEMENTS;
      return;
    }
    quietUntil.current = now + SETTLE_AFTER_MS;
    onSlow();
  });
  return null;
}
