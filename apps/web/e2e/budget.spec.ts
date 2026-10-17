import { expect, test, type Page } from "@playwright/test";
import { GUIDE_STORAGE_KEY } from "../src/components/studio/guide-store";
import { LOOK_STORAGE_KEY } from "../src/components/studio/useArrival";

/**
 * Round 10, Part 3: the performance budget on the software renderer.
 * The first picture of the room within `FIRST_MS`; the Corner view
 * settled (every bake in, the frame still) within `CORNER_MS` of its
 * button; and once settled nothing bakes again by itself: the room's
 * bounce (`data-gi-runs`) and the probes (`data-probe-runs`) stand still
 * while the camera does. Budgets scale with VISUAL_SLOW as the visual
 * project's waits do; the numbers each run measured are printed.
 */
const SLOW = Number(process.env.VISUAL_SLOW) || 1;
const FIRST_MS = 5_000 * SLOW;
const CORNER_MS = 20_000 * SLOW;
/** how long a settled room is watched for a bake starting by itself */
const QUIET_MS = 10_000;

const stage = (page: Page) => page.locator(".stage-3d");
const settledNow = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector(".stage-3d");
    if (!s) return false;
    const a = (n: string) => s.getAttribute(n) ?? "";
    return (
      a("data-settled") === "true" &&
      /ready|off/.test(a("data-gi")) &&
      /ready|off/.test(a("data-probes")) &&
      /ready|off/.test(a("data-reflection")) &&
      a("data-bakes") === "0" &&
      a("data-materials-pending") === "0" &&
      a("data-models-pending") === "0" &&
      a("data-gliding") !== "true"
    );
  });
/** ms until the room is settled, given up at six times the budget
    (the stage's state then printed, so a miss says what it waited on) */
const waitSettled = async (page: Page, within: number) => {
  const t0 = Date.now();
  while (!(await settledNow(page))) {
    if (Date.now() - t0 > within * 6) {
      const state = await page.evaluate(() => {
        const s = document.querySelector(".stage-3d");
        return s
          ? [...s.attributes]
              .filter((a) =>
                /settled|gi|probes|reflection|bakes|pending|gliding|drawn/.test(
                  a.name,
                ),
              )
              .map((a) => `${a.name}=${a.value}`)
              .join(" ")
          : "no stage";
      });
      console.log(`BUDGET waiting on: ${state}`);
      break;
    }
    await page.waitForTimeout(250);
  }
  return Date.now() - t0;
};
const runs = async (page: Page) => ({
  gi: Number(await stage(page).getAttribute("data-gi-runs")),
  probes: Number(await stage(page).getAttribute("data-probe-runs")),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ guides, look }) => {
      localStorage.setItem(guides.key, guides.value);
      localStorage.setItem(look.key, look.value);
    },
    {
      guides: { key: GUIDE_STORAGE_KEY, value: JSON.stringify({ intro: true }) },
      look: {
        key: LOOK_STORAGE_KEY,
        value: JSON.stringify({
          scene: { quality: "full", reflections: false, bounce: false },
        }),
      },
    },
  );
});

test("the room keeps its performance budget", async ({ page, context }) => {
  test.setTimeout(900_000 * SLOW);
  // a development server compiles the page on its first visit: one
  // visit first, so the budget is the studio's and not the compiler's
  const warm = await context.newPage();
  await warm.goto("/rounded?probes=fast");
  await expect(stage(warm)).toHaveAttribute("data-drawn", "true", {
    timeout: 300_000 * SLOW,
  });
  await warm.close();
  const t0 = Date.now();
  await page.goto("/rounded?probes=fast");
  await expect(stage(page)).toHaveAttribute("data-drawn", "true", {
    timeout: 120_000 * SLOW,
  });
  const first = Date.now() - t0;
  // the opening's flight and the first bakes over, before the Corner
  const opening = await waitSettled(page, CORNER_MS * 2);
  console.log(`BUDGET first=${first}ms opening settled=${opening}ms`);
  const before = await runs(page);
  await page
    .getByRole("button", { name: "Corner view, as a photograph" })
    .click();
  // the glide begins on the next frame
  await expect(stage(page)).toHaveAttribute("data-gliding", "true", {
    timeout: 5_000,
  }).catch(() => undefined);
  const corner = await waitSettled(page, CORNER_MS);
  const settled = await runs(page);
  await page.waitForTimeout(QUIET_MS);
  const after = await runs(page);
  console.log(
    `BUDGET first=${first}ms corner=${corner}ms gi-runs=${before.gi}->${settled.gi}->${after.gi} probe-runs=${before.probes}->${settled.probes}->${after.probes}`,
  );
  // nothing bakes again by itself once the room is still
  expect(after).toEqual(settled);
  expect(first, "first picture, ms").toBeLessThan(FIRST_MS);
  expect(corner, "Corner settled, ms").toBeLessThan(CORNER_MS);
});
