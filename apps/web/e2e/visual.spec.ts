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
 */
const DRIFT = {
  threshold: 0.05,
  maxDiffPixelRatio: 0.005,
  animations: "disabled",
  // a development server mid-compile, and the software renderer, are slow
  timeout: 20_000,
} as const;
/** the surroundings, the props and the frame take a moment to settle */
const SETTLE = 4000;

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
        value: JSON.stringify({ scene: { quality: "full" } }),
      },
    },
  );
  await page.goto("/rounded");
  await expect(page.locator('html[data-arrived="true"]')).toBeAttached({
    timeout: 20_000,
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
    {
      timeout: 180_000,
    },
  );
  await expect(stage(page)).toHaveAttribute("data-probes", /ready|off/, {
    timeout: 180_000,
  });
  await expect(stage(page)).toHaveAttribute("data-reflection", /ready|off/, {
    timeout: 180_000,
  });
  // the edges resolved: TRAA's settle frames are through
  await expect(stage(page)).toHaveAttribute("data-settled", "true", {
    timeout: 180_000,
  });
  await page.waitForTimeout(SETTLE);
};

const stage = (page: Page) => page.locator(".shell-stage .stage-3d");

test("the room as it opens: the light panels by day", async ({ page }) => {
  await expect(stage(page)).toHaveScreenshot("day-panels.png", DRIFT);
});

test("the room under a sunset", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "A sunset" }).click();
  await page.keyboard.press("Escape");
  await settled(page);
  await expect(stage(page)).toHaveScreenshot("day-sunset.png", DRIFT);
});

test("the room in the evening, with its shadows", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "Evening" }).click();
  await page.keyboard.press("Escape");
  await settled(page);
  await expect(stage(page)).toHaveScreenshot("evening-panels.png", DRIFT);
});

test("the front elevation", async ({ page }) => {
  await page.getByRole("radio", { name: "Front" }).click();
  await page.waitForTimeout(SETTLE);
  await expect(stage(page)).toHaveScreenshot("elevation-front.png", DRIFT);
});

test("at eye level, walking", async ({ page }) => {
  await page.getByRole("button", { name: "Walk the room" }).click();
  // the walk's ceiling changes the room: the probes and the floor's
  // picture are taken again, and the picture waits for them
  await settled(page);
  await expect(stage(page)).toHaveScreenshot("walk.png", DRIFT);
});
