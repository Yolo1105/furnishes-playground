import { expect, test, type Page } from "@playwright/test";

/**
 * The studio under a finger, on a tablet's and a phone's screen: targets
 * a finger can hit, no tooltip waiting for a hover, a long press for a
 * piece's actions, two fingers pinching the plan, a tile carried after a
 * hold, and nothing wider than the screen.
 */
const touch = async (
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  at: { x: number; y: number },
  id: number,
  /** the element that holds the pointer, when not the one under it */
  on?: string,
) =>
  page.evaluate(
    ({ type, at, id, on }) => {
      const el =
        (on ? document.querySelector(on) : null) ??
        document.elementFromPoint(at.x, at.y) ??
        document.body;
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          isPrimary: id === 1,
          clientX: at.x,
          clientY: at.y,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    },
    { type, at, id, on },
  );

/** the plan on the main surface: the swap lives in Eva's drawer here */
const toPlan = async (page: Page) => {
  await page.locator(".shell-tabs").getByText("Eva", { exact: true }).click();
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await page.getByRole("button", { name: "Close Eva panel" }).click();
  await expect(page.locator(".shell-stage .plan-svg")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  // the first visit's welcome is not what these tests are about
  await page.addInitScript(() =>
    localStorage.setItem("furnishes.guides", JSON.stringify({ intro: true })),
  );
  await page.goto("/rounded");
});

test("a finger: targets, no tooltips, a long press, nothing wider than the screen", async ({
  page,
}) => {
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
  ).toBe(true);
  // targets a finger can hit
  const add = page.getByRole("button", { name: "Add", exact: true });
  const box = (await add.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(40);
  // no tooltip waits for a hover
  await add.hover();
  expect(
    await add.evaluate((el) => getComputedStyle(el, "::after").display),
  ).toBe("none");
  // nothing wider than the screen
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  // a long press on a piece raises its actions, whatever the tool
  await toPlan(page);
  const piece = page.locator(".stage-pieces").getByRole("button", {
    name: "Bookwall",
    exact: true,
  });
  const b = (await piece.boundingBox())!;
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await touch(page, "pointerdown", at, 1);
  await page.waitForTimeout(600);
  await touch(page, "pointerup", at, 1);
  await expect(
    page.locator(".stage-pieces").getByRole("button", { name: "Details" }),
  ).toBeVisible();
  // what a hover would reveal stands shown: the cart on a shelf card
  const cart = page.locator(".shelf-card .shelf-card-cart").first();
  expect(await cart.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  // Help opens on the Touch tab under a finger; on a phone the gear is
  // in the Project drawer
  const projectTab = page
    .locator(".shell-tabs")
    .getByText("Project", { exact: true });
  if (await projectTab.isVisible()) await projectTab.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Help" }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.getByRole("tab", { name: "Touch" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(help.getByRole("tabpanel")).toContainText("Press and hold it");
  await help.getByRole("button", { name: "Close" }).click();
});

test("two fingers pinch the plan; a tile is carried after a hold", async ({
  page,
}) => {
  await toPlan(page);
  const sheet = page.locator(".shell-stage .plan");
  const svg = page.locator(".shell-stage .plan-svg");
  const r = (await svg.boundingBox())!;
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  // two fingers 100 px apart, spread to 200: the sheet is twice as big
  await touch(page, "pointerdown", { x: c.x - 50, y: c.y }, 1);
  await touch(page, "pointerdown", { x: c.x + 50, y: c.y }, 2);
  for (let k = 1; k <= 5; k++) {
    await touch(page, "pointermove", { x: c.x - 50 - 10 * k, y: c.y }, 1);
    await touch(page, "pointermove", { x: c.x + 50 + 10 * k, y: c.y }, 2);
  }
  await touch(page, "pointerup", { x: c.x - 100, y: c.y }, 1);
  await touch(page, "pointerup", { x: c.x + 100, y: c.y }, 2);
  await expect(sheet).toHaveCSS("transform", /matrix\(2, 0, 0, 2/);
  await page.keyboard.press("0");
  // a tile held, then carried onto the room
  const saved = page.locator(".main-shelf").getByRole("tab", { name: /Saved/ });
  const n = Number(((await saved.textContent()) ?? "").replace(/\D/g, ""));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const tile = page
    .getByRole("dialog", { name: "Add to the room" })
    .getByRole("button", { name: /^Add Shelf,/ });
  const t = (await tile.boundingBox())!;
  const from = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  await touch(page, "pointerdown", from, 1);
  await page.waitForTimeout(600);
  await expect(page.locator(".shell-stage")).toHaveAttribute(
    "data-dropping",
    "true",
  );
  const held = '[aria-label^="Add Shelf,"]';
  await touch(page, "pointermove", c, 1, held);
  await touch(page, "pointerup", c, 1, held);
  await expect(saved).toHaveText(`Saved${n + 1}`);
  await expect(page.locator(".shell-stage")).toHaveAttribute(
    "data-dropping",
    "false",
  );
});
