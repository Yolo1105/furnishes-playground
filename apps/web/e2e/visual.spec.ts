import { expect, test, type Page } from "@playwright/test";
import { GUIDE_STORAGE_KEY } from "../src/components/studio/guide-store";
import { LOOK_STORAGE_KEY } from "../src/components/studio/useArrival";

/**
 * The room as it looks: five fixed views of the first project, each
 * kept as a picture beside this file and compared on every run, so a
 * change to the light, the materials or the renderer is seen before it
 * ships. A pixel counts as changed past a twentieth of its colour (the
 * finish moves most of the picture by less than that; the default of a
 * fifth let it through), and a view may drift by half a percent of its
 * pixels (the software renderer's noise); more is a change to look at,
 * and `--update-snapshots` keeps it once it is meant.
 *
 * The pictures are taken with `?probes=fast`: the probe grid's quick
 * bake (fewer probes, the smallest pictures, no bounce pass), so a
 * software renderer bakes a room in seconds rather than minutes; the
 * baselines are of that bake, and the full grid is judged by hand on
 * WebGPU (the checklist). Every wait and timeout here scales with
 * VISUAL_SLOW (1 by default; 3 on a slow machine), set in the shell.
 */
/** how much slower than the machine the waits were tuned on */
const SLOW = Number(process.env.VISUAL_SLOW) || 1;
const DRIFT = {
  threshold: 0.05,
  maxDiffPixelRatio: 0.005,
  animations: "disabled",
  // a development server mid-compile, and the software renderer, are slow
  timeout: 20_000 * SLOW,
} as const;
/** the surroundings, the props and the frame take a moment to settle */
const SETTLE = 4000 * SLOW;
/** the longest a bake or a load is given */
const LONG = 180_000 * SLOW;

test.beforeEach(async ({ page }) => {
  // the full finish, whatever the test's GPU: the pictures are of it
  await page.addInitScript(
    ({ guides, look }) => {
      localStorage.setItem(guides.key, guides.value);
      localStorage.setItem(look.key, look.value);
    },
    {
      guides: {
        key: GUIDE_STORAGE_KEY,
        value: JSON.stringify({ intro: true }),
      },
      look: {
        key: LOOK_STORAGE_KEY,
        // the Full picture without the desktop extras: the reflections
        // and the bounce light are judged by hand on WebGPU (the
        // checklist), and would leave these pictures to settle longer
        value: JSON.stringify({
          scene: { quality: "full", reflections: false, bounce: false },
        }),
      },
    },
  );
  await page.goto("/rounded?probes=fast");
  await expect(page.locator('html[data-arrived="true"]')).toBeAttached({
    timeout: 20_000 * SLOW,
  });
  await settled(page);
});

/** the room's probes are baked over frames and its floor's picture is
    taken a moment after a change: the picture waits for both (the
    software renderer takes a while over each) */
// a software renderer bakes the probes in a minute or two, and takes
// its settle frames slowly after; the waits allow for it
const settled = async (page: Page) => {
  // the stage says off until the backend is known: wait for that first
  await expect(stage(page)).toHaveAttribute(
    "data-backend",
    /webgpu|webgl|software/,
    { timeout: LONG },
  );
  await expect(stage(page)).toHaveAttribute("data-probes", /ready|off/, {
    timeout: LONG,
  });
  await expect(stage(page)).toHaveAttribute("data-reflection", /ready|off/, {
    timeout: LONG,
  });
  await still(page);
  await page.waitForTimeout(SETTLE);
};

/** the frame at rest, checked again right before every picture: the
    photographed sets listed are all in (so no surface is still on its
    way), TRAA's settle frames are through, and the camera's glide to
    the angle is over (the stage says so once one has run; before any,
    the attribute is not there) */
const still = async (page: Page) => {
  await expect(stage(page)).toHaveAttribute("data-materials-pending", "0", {
    timeout: LONG,
  });
  await expect(stage(page)).toHaveAttribute("data-settled", "true", {
    timeout: LONG,
  });
  await expect(stage(page)).not.toHaveAttribute("data-gliding", "true", {
    timeout: 60_000 * SLOW,
  });
};

/** the picture, once the frame is still */
const picture = async (page: Page, name: string) => {
  await still(page);
  await expect(stage(page)).toHaveScreenshot(name, DRIFT);
};

const stage = (page: Page) => page.locator(".shell-stage .stage-3d");

test("the room as it opens: the light panels by day", async ({ page }) => {
  await picture(page, "day-panels.png");
});

test("the room under a sunset", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "A sunset" }).click();
  await page.keyboard.press("Escape");
  await settled(page);
  await picture(page, "day-sunset.png");
});

test("the room in the evening, with its shadows", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "Evening" }).click();
  await page.keyboard.press("Escape");
  await settled(page);
  await picture(page, "evening-panels.png");
});

test("the front elevation", async ({ page }) => {
  await page.getByRole("radio", { name: "Front" }).click();
  await page.waitForTimeout(SETTLE);
  await picture(page, "elevation-front.png");
});

test("at eye level, walking", async ({ page }) => {
  await page.getByRole("button", { name: "Walk the room" }).click();
  // the walk's ceiling changes the room: the probes and the floor's
  // picture are taken again, and the picture waits for them
  await settled(page);
  await picture(page, "walk.png");
});
