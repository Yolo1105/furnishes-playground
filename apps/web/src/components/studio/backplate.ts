import {
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { create } from "zustand";
import { devParam } from "./dev-flags";

/**
 * The view out of the windows from a photographed backplate
 * (public/sky/README.md): an equirectangular picture, an HDR or a JPEG
 * or PNG, that each window samples along the eye's ray through its pane
 * in place of the drawn outlook (Room3D's `Outside`). None is installed:
 * the sandbox could not reach Poly Haven, so the owner fetches the files
 * and names them here. `?backplate=<url>` tries a picture in development
 * (the test's), whatever is named. The stage says how it stands
 * (`data-backplate`: none, loading, ready, failed); a picture that does
 * not load leaves the drawn outlook.
 */

/** the backplate by look, a path under public/, or none */
export const BACKPLATES: Record<"day" | "evening", string | null> = {
  day: null,
  evening: null,
};
/** how far the backplate is turned about the upright, radians, so its
    sun stands where the studio's sun does (sun-position.ts); set with
    the file */
export const BACKPLATE_TURN = 0;

export type BackplateState = "none" | "loading" | "ready" | "failed";

/** the pictures by path, loaded once and kept */
const loaded = new Map<string, Promise<Texture>>();
const load = (url: string) => {
  let p = loaded.get(url);
  if (!p) {
    p = (
      /\.hdr$/i.test(url)
        ? new HDRLoader().loadAsync(url)
        : new TextureLoader().loadAsync(url).then((t) => {
            t.colorSpace = SRGBColorSpace;
            return t;
          })
    ).then((t) => {
      t.mapping = EquirectangularReflectionMapping;
      return t;
    });
    loaded.set(url, p);
  }
  return p;
};

type Backplates = {
  state: BackplateState;
  /** the picture for the look asked for last, once it is in */
  map: Texture | null;
  url: string | null;
};
export const useBackplate = create<Backplates>(() => ({
  state: "none",
  map: null,
  url: null,
}));

/** the backplate for a look asked for: its picture loaded and kept, the
    state told to the stage */
export const askBackplate = (evening: boolean) => {
  const url = devParam("backplate") ?? BACKPLATES[evening ? "evening" : "day"];
  const st = useBackplate.getState();
  if (url === st.url) return;
  if (!url) {
    useBackplate.setState({ state: "none", map: null, url: null });
    return;
  }
  useBackplate.setState({ state: "loading", map: null, url });
  load(url).then(
    (map) => {
      if (useBackplate.getState().url === url)
        useBackplate.setState({ state: "ready", map });
    },
    () => {
      loaded.delete(url);
      if (useBackplate.getState().url === url)
        useBackplate.setState({ state: "failed", map: null });
    },
  );
};
