import { expect, test, type Page } from "@playwright/test";
import { GUIDE_STORAGE_KEY } from "../src/components/studio/guide-store";

/**
 * The room as it looks: five fixed views of the first project, each
 * kept as a picture beside this file and compared on every run, so a
 * change to the light, the materials or the renderer is seen before it
 * ships. A view may drift by half a percent of its pixels (the software
 * renderer's noise); more is a change to look at, and
 * `--update-snapshots` keeps it once it is meant.
 */
const DRIFT = {
  maxDiffPixelRatio: 0.005,
  animations: "disabled",
  // a development server mid-compile, and the software renderer, are slow
  timeout: 20_000,
} as const;
/** the surroundings, the props and the frame take a moment to settle */
const SETTLE = 4000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: GUIDE_STORAGE_KEY, value: JSON.stringify({ intro: true }) },
  );
  await page.goto("/rounded");
  await expect(page.locator('html[data-arrived="true"]')).toBeAttached({
    timeout: 20_000,
  });
  await page.waitForTimeout(SETTLE);
});

const stage = (page: Page) => page.locator(".shell-stage .stage-3d");

test("the room as it opens: the light panels by day", async ({ page }) => {
  await expect(stage(page)).toHaveScreenshot("day-panels.png", DRIFT);
});

test("the room under a sunset", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "A sunset" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(SETTLE);
  await expect(stage(page)).toHaveScreenshot("day-sunset.png", DRIFT);
});

test("the room in the evening, with its shadows", async ({ page }) => {
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu.getByRole("menuitemradio", { name: "Evening" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(SETTLE);
  await expect(stage(page)).toHaveScreenshot("evening-panels.png", DRIFT);
});

test("the front elevation", async ({ page }) => {
  await page.getByRole("radio", { name: "Front" }).click();
  await page.waitForTimeout(SETTLE);
  await expect(stage(page)).toHaveScreenshot("elevation-front.png", DRIFT);
});

test("at eye level, walking", async ({ page }) => {
  await page.getByRole("button", { name: "Walk the room" }).click();
  await page.waitForTimeout(SETTLE);
  await expect(stage(page)).toHaveScreenshot("walk.png", DRIFT);
});
