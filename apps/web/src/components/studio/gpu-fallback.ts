/**
 * The studio never waits on a GPU that does not answer. WebGPU on a
 * real device can hang where WebGL would not: the adapter or the device
 * asked for and never given, a shader's pipeline built and never
 * finished, the device lost under load. Each left the stage blank until
 * a refresh, and sometimes several. Here each wait has an end: past it
 * the studio draws on its WebGL backend instead, and the browser
 * remembers for a day, so the next visit starts on WebGL at once and
 * the one after tries WebGPU again.
 */
import { type Fault, useStudio } from "./studio-store";

const KEY = "furnishes.gpu";
/** the page started over on WebGL in this tab already: not again */
const STARTED_OVER = "furnishes.gpu-started-over";
/** how long a failed WebGPU is left alone, ms */
export const SHUN_MS = 24 * 60 * 60 * 1000;
/** the adapter's answer, ms: it comes in a few ms where there is one */
export const ADAPTER_WAIT_MS = 4000;
/** the device's answer, ms */
export const INIT_WAIT_MS = 8000;
/** a shader's build, ms: a part's pipeline takes tens of ms, a second
    on a slow device; past this it is taken as stuck */
export const BUILD_WAIT_MS = 6000;
/** the room's first picture on WebGPU after the backend is known, ms:
    a few seconds on a real GPU, a minute only when something is stuck */
export const FIRST_PICTURE_WAIT_MS = 45000;

let why: string | null = null;
/** why this page draws on WebGL where it has WebGPU, if it does */
export const fellBackFor = () => why;

/** why WebGPU was last given up on in this browser, while that is
    recent; null when WebGPU is to be tried */
export const shunnedFor = (now = Date.now()): string | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      why?: unknown;
      at?: unknown;
    } | null;
    const recent =
      v && typeof v.why === "string" && typeof v.at === "number"
        ? now - v.at < SHUN_MS
          ? v.why
          : null
        : null;
    if (recent) why = recent;
    return recent;
  } catch {
    return null;
  }
};

/** WebGPU given up on, and why: this page and the next start draw on
    WebGL */
export const shun = (reason: string, now = Date.now()) => {
  why = reason;
  try {
    localStorage.setItem(KEY, JSON.stringify({ why: reason, at: now }));
  } catch {
    /* the next visit tries WebGPU again */
  }
};

/** a promise's value, or `late` once `ms` have passed without one */
export const within = <T, L>(p: Promise<T>, ms: number, late: L) =>
  new Promise<T | L>((resolve, reject) => {
    const t = setTimeout(() => resolve(late), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });

/** WebGPU given up on after the canvas has it (the device lost, the
    first picture never come): the page starts over once, on WebGL;
    false when it already has in this tab */
export const startOverOnWebGL = (why: string) => {
  shun(why);
  try {
    if (sessionStorage.getItem(STARTED_OVER)) return false;
    sessionStorage.setItem(STARTED_OVER, why);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
};

/** whether an effect has been given up on in this page */
export const givenUp = (what: Fault) =>
  useStudio.getState().faults.includes(what);

/**
 * An effect the GPU could not draw (the probes' bake, the floor's
 * picture), said once and given up on for the page. Each runs in the
 * frame loop, and a throw there ends the frame before the room is drawn
 * (fiber's loop has no catch): one that threw every frame left the
 * picture stuck where it was and the pieces still on their way never
 * drawn. The room goes on without the effect instead.
 */
export const gaveUp = (what: Fault, e: unknown) => {
  if (givenUp(what)) return;
  console.warn(`${what}: given up on, the GPU could not draw it`, e);
  useStudio.getState().fault(what);
};
