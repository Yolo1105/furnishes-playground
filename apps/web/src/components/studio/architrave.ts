import { BufferGeometry, Float32BufferAttribute } from "three";

/**
 * A door's architrave as a joiner runs it: one moulding, its profile
 * swept up each side of the opening and across its head, the three
 * pieces meeting in mitres at the head's corners, as the real ones are
 * cut. The profile is a moulded strip: a small bead at the opening's
 * edge, a face rising gently outwards, a rounded outer edge. Each piece
 * is built so its end lies on the 45° line, so the corner reads as two
 * boards meeting, the faint line between them where the light turns.
 */

/** the moulding, m: its width across the wall and its thickness off it
    at the outer edge, and the round of that edge */
export const ARCHITRAVE = { width: 0.068, thick: 0.015, round: 0.006 };

/** the profile, outwards from the opening's edge (x) and off the wall
    (z): a bead, the face, the round outer edge, back to the wall */
export const profile = (): [number, number][] => {
  const { width: w, thick: t, round: r } = ARCHITRAVE;
  const pts: [number, number][] = [
    [0, 0],
    [0, 0.008],
    [0.0015, 0.0105],
    [0.004, 0.011],
    [0.006, 0.0095],
    [w - r, t],
  ];
  // the outer edge rounded down to the wall
  for (let k = 1; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    pts.push([w - r + r * Math.sin(a), t - r + r * Math.cos(a)]);
  }
  pts.push([w, 0]);
  return pts;
};

/**
 * The architrave round an opening `width` wide and `tall` high, in the
 * opening's frame (x across from its middle, y up from the floor, z off
 * the wall's face, the moulding standing out towards +z): the two side
 * pieces from the floor and the head across, mitred where they meet.
 */
export const architraveGeometry = (width: number, tall: number) => {
  const prof = profile();
  const pos: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  // a side: the profile's x outwards from the jamb, so it runs from the
  // floor to the mitre, longer at its outer edge than its inner
  for (const s of [-1, 1] as const) {
    for (let i = 0; i < prof.length - 1; i++) {
      const [x0, z0] = prof[i]!;
      const [x1, z1] = prof[i + 1]!;
      const ax = s * (width / 2 + x0);
      const bx = s * (width / 2 + x1);
      const a: [number, number, number] = [ax, 0, z0];
      const b: [number, number, number] = [bx, 0, z1];
      const c: [number, number, number] = [bx, tall + x1, z1];
      const d: [number, number, number] = [ax, tall + x0, z0];
      // faces outwards, whichever side
      if (s > 0) quad(a, b, c, d);
      else quad(b, a, d, c);
    }
  }
  // the head: the profile's x upwards from the opening's top, so it runs
  // across between the mitres, longer at its top than its foot
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, z0] = prof[i]!;
    const [x1, z1] = prof[i + 1]!;
    const a: [number, number, number] = [-(width / 2 + x0), tall + x0, z0];
    const b: [number, number, number] = [width / 2 + x0, tall + x0, z0];
    const c: [number, number, number] = [width / 2 + x1, tall + x1, z1];
    const d: [number, number, number] = [-(width / 2 + x1), tall + x1, z1];
    quad(a, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
};

/** the mouldings made, by the opening's size: a flat has a few sizes
    of doorway, each made once and shared (never disposed: a handful of
    small geometries) */
const made = new Map<string, BufferGeometry>();
export const architraveFor = (width: number, tall: number) => {
  const key = `${width.toFixed(4)}|${tall.toFixed(4)}`;
  let g = made.get(key);
  if (!g) made.set(key, (g = architraveGeometry(width, tall)));
  return g;
};
