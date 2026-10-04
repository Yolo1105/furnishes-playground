import { expect, test, type Page } from "@playwright/test";
import {
  assetGroups,
  pieceTotals,
  sgd,
} from "../src/components/studio/assets-data";
import { products } from "../src/components/studio/catalogue";
import { GUIDE_STORAGE_KEY } from "../src/components/studio/guide-store";
import { ROOM_TEMPLATES } from "../src/components/studio/room-templates";

/* expectations come from the same data the app renders */
const top = assetGroups.flatMap((g) => g.items);
const totals = pieceTotals(top);
const rows =
  assetGroups.length +
  top.length +
  top.reduce((n, a) => n + (a.children?.length ?? 0), 0);
const first = top[0]!;
const coat = products.find((p) => p.name === "Coat stand")!;
const lampRows = assetGroups
  .filter((g) => g.items.some((a) => /lamp/i.test(a.name)))
  .reduce(
    (n, g) => n + 1 + g.items.filter((a) => /lamp/i.test(a.name)).length,
    0,
  );

/** the panels slide in on arrival; geometry is measured once they stand */
const arrived = (page: Page) =>
  page.waitForFunction(() => {
    if (document.documentElement.dataset.arrived !== "true") return false;
    return [...document.querySelectorAll(".shell-rail, .main-top, .main-shelf")]
      .map((el) => getComputedStyle(el))
      .every((cs) => cs.opacity === "1" && cs.translate === "none");
  });

/* the intro guide opens itself on a first visit; most tests have seen it */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: GUIDE_STORAGE_KEY, value: JSON.stringify({ intro: true }) },
  );
});

/** The background is the studio palette: cream→peach gradient + blobs. */
test("background paints the playground palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".bg-fluid .bg-blob")).toHaveCount(3);
  const image = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  );
  expect(image).toContain("linear-gradient");
  expect(image).toContain("rgb(255, 244, 227)");
  // the theme tokens must reach plain CSS: the accent resolves on :root and
  // actually paints (a blank token once turned every orange invisible)
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );
  // the token is written in oklch and may be served as lab; what matters
  // is the orange it paints, read back through a canvas as sRGB
  expect(accent).toMatch(/^(oklch|lab)\(/);
  const painted = await page
    .locator(".assets-mark[data-kind='piece']")
    .first()
    .evaluate((el) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
  const [r, g, b] = painted;
  expect(Math.abs(r! - 237)).toBeLessThan(4);
  expect(Math.abs(g! - 92)).toBeLessThan(4);
  expect(b!).toBeLessThan(8);
});

for (const [path, corners] of [
  ["/", "square"],
  ["/rounded", "rounded"],
] as const) {
  test(`${path} lays out left | main | right (${corners})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const shell = page.locator(".shell");
    await expect(shell).toHaveAttribute("data-corners", corners);
    const [l, m, r] = await Promise.all([
      page.locator(".shell-rail-left").boundingBox(),
      page.locator(".shell-main").boundingBox(),
      page.locator(".shell-rail-right").boundingBox(),
    ]);
    expect(l && m && r).toBeTruthy();
    expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + 1);
    expect(m!.x + m!.width).toBeLessThanOrEqual(r!.x + 1);
    expect(m!.width).toBeGreaterThan(l!.width);
    expect(m!.width).toBeGreaterThan(r!.width);
    const radius = await page
      .locator(".shell-rail-left > .shell-panel")
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const panelRadius = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--r-panel")
        .trim(),
    );
    expect(radius).toBe(corners === "rounded" ? panelRadius : "0px");
  });

  test(`${path} turns the panels into drawers on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const left = page.locator(".shell-rail-left");
    const before = await left.boundingBox();
    expect(before!.x + before!.width).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.locator(".shell")).toHaveAttribute("data-open", "left");
    await expect
      .poll(async () => (await left.boundingBox())!.x)
      .toBeGreaterThanOrEqual(0);
  });
}

test("/rounded has a toolbar on top and a sideways-scrolling shelf below", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await arrived(page);
  const main = (await page.locator(".shell-main").boundingBox())!;
  const top = (await page.locator(".main-top").boundingBox())!;
  const shelf = (await page.locator(".main-shelf").boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(main.y);
  expect(top.height).toBeLessThan(shelf.height);
  expect(shelf.y + shelf.height).toBeLessThanOrEqual(main.y + main.height + 1);
  // the cards scroll sideways once the main column is narrower than them
  await page.setViewportSize({ width: 1100, height: 900 });
  const scroll = page.locator(".main-shelf-scroll");
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth > el.clientWidth))
    .toBe(true);
  await scroll.evaluate((el) => el.scrollBy({ left: 300 }));
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(
    page.locator(".shelf-card").first().locator(".shelf-card-name"),
  ).toHaveText(first.name);
  await expect(
    page.locator(".shelf-card").first().locator(".shelf-card-price"),
  ).toHaveText(sgd(first.price!));
});

test("rails collapse into the toolbar and come back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shell = page.locator(".shell");
  const main = page.locator(".shell-main");
  const wide = (await main.boundingBox())!.width;

  await expect(page.locator(".shell-project-name")).toHaveText("First project");
  // only the project's name is the button; the brand is not
  await expect(page.getByRole("button", { name: /Furnishes/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Collapse project panel" }).click();
  await expect(shell).toHaveAttribute("data-left", "collapsed");
  await expect
    .poll(async () => (await main.boundingBox())!.width)
    .toBeGreaterThan(wide + 100);
  const restore = page.getByRole("button", { name: "Show project panel" });
  const bar = (await page.locator(".main-top").boundingBox())!;
  const rb = (await restore.boundingBox())!;
  expect(rb.x).toBeGreaterThanOrEqual(bar.x);
  expect(rb.x).toBeLessThan(bar.x + bar.width / 2);
  await restore.click();
  await expect(shell).toHaveAttribute("data-left", "open");
  // Eva's panel has no collapse of its own: the eye hides everything
  await expect(
    page.getByRole("button", { name: "Collapse Eva panel" }),
  ).toHaveCount(0);
  const eye = page.getByRole("button", { name: "Hide panels" });
  // the rail's reopening still moves the toolbar: wait until the main
  // column is back to the width it had
  await expect
    .poll(async () => Math.abs((await main.boundingBox())!.width - wide) < 1)
    .toBe(true);
  const eb = (await eye.boundingBox())!;
  await eye.click();
  await expect(shell).toHaveAttribute("data-ui", "hidden");
  await expect(page.locator(".shell-rail-left")).toBeHidden();
  await expect(page.locator(".main-top")).toBeHidden();
  // the eye stays where it stood, now the way back
  const peek = page.getByRole("toolbar", { name: "Looking" });
  const back = (await peek
    .getByRole("button", { name: "Show panels" })
    .boundingBox())!;
  expect(Math.abs(back.x - eb.x)).toBeLessThan(2);
  expect(Math.abs(back.y - eb.y)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(shell).toHaveAttribute("data-ui", "shown");
  await page.getByRole("button", { name: "Hide panels" }).click();
  await peek.getByRole("button", { name: "Show panels" }).click();
  await expect(shell).toHaveAttribute("data-ui", "shown");

  await expect(page.getByRole("tab", { name: "Agent" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "New chat" })).toHaveAttribute(
    "data-tooltip",
    "New chat",
  );
});

test("Eva's input box and the user bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await arrived(page);
  // edges line up: toolbar top on the rails' top, shelf bottom on their bottom
  const left = (await page.locator(".shell-rail-left").boundingBox())!;
  const top = (await page.locator(".main-top").boundingBox())!;
  const shelf = (await page.locator(".main-shelf").boundingBox())!;
  const main = (await page.locator(".shell-main").boundingBox())!;
  expect(Math.abs(top.y - left.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(shelf.y + shelf.height - (left.y + left.height)),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(shelf.x - main.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(top.width - main.width)).toBeLessThanOrEqual(1);

  const send = page.getByRole("button", { name: "Voice input" });
  await expect(send).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Eva" })
    .fill("a calm bedroom");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await page.getByRole("button", { name: /^Ask/ }).click();
  await page.getByRole("menuitemradio", { name: "Room layout" }).click();
  await expect(
    page.getByRole("button", { name: /^Room layout/ }),
  ).toBeVisible();

  await expect(page.locator(".user-name")).toHaveText("Studio User");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
});

test("the outliner searches, filters and marks the pieces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const tree = page.getByRole("tree", { name: "Assets" });
  await expect(tree.getByRole("treeitem")).toHaveCount(rows);
  // a Furnishes piece carries the mark and a price; a room item does not
  const bookwall = tree.locator(".assets-row", { hasText: "Bookwall" }).first();
  await expect(
    bookwall.locator(".assets-mark[data-kind='piece']"),
  ).toBeVisible();
  await expect(bookwall.locator(".assets-price")).toHaveText(sgd(first.price!));
  const sofa = tree.locator(".assets-row", { hasText: "Sofa" });
  await expect(sofa.locator(".assets-mark[data-kind='piece']")).toHaveCount(0);
  // hierarchy: a piece built from segments folds
  await expect(
    tree.locator(".assets-row", { hasText: "Segment A" }),
  ).toBeVisible();
  await bookwall.getByRole("button", { name: "Collapse" }).click();
  await expect(
    tree.locator(".assets-row", { hasText: "Segment A" }),
  ).toHaveCount(0);
  // search
  await page.getByRole("searchbox", { name: "Search assets" }).fill("lamp");
  await expect(tree.getByRole("treeitem")).toHaveCount(lampRows);
  await page.getByRole("searchbox", { name: "Search assets" }).fill("");
  // filter: only the pieces
  await page.getByRole("button", { name: "Filter assets" }).click();
  // the filter flies out to the right of the panel
  const [menu, rail] = await Promise.all([
    page.getByRole("dialog", { name: "Filter" }).boundingBox(),
    page.locator(".shell-rail-left").boundingBox(),
  ]);
  expect(menu!.x).toBeGreaterThan(rail!.x + rail!.width);
  await page.getByRole("button", { name: "Furnishes pieces" }).click();
  await page.keyboard.press("Escape");
  await expect(tree.locator(".assets-row[data-kind='decor']")).toHaveCount(0);
  await expect(
    tree.locator(".assets-row[data-kind='piece']").first(),
  ).toBeVisible();
  await expect(page.locator(".assets-count")).toHaveCount(0);
});

test("the shelf's tab counts the pieces and folds the cards away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  const saved = shelf.getByRole("tab", { name: /Saved/ });
  const sum = shelf.locator(".main-shelf-sum");
  // Saved holds what can be bought: the pieces, never the room items
  await expect(saved).toHaveText(`Saved${totals.pieces}`);
  await expect(sum).toHaveText(
    `${sgd(totals.total)} · ${totals.pieces} pieces`,
  );
  await expect(shelf.locator(".shelf-card")).toHaveCount(totals.pieces);
  await expect(shelf.locator(".shelf-card[data-kind='decor']")).toHaveCount(0);
  await expect(shelf.getByRole("tab", { name: /Cart/ })).toHaveText("Cart0");
  const tall = (await shelf.boundingBox())!.height;
  await page.getByRole("button", { name: "Hide pieces" }).click();
  await expect(shelf).toHaveAttribute("data-collapsed", "true");
  await expect
    .poll(async () => (await shelf.boundingBox())!.height)
    .toBeLessThan(tall / 2);
  await expect(saved).toBeVisible();
  await page.getByRole("button", { name: "Show pieces" }).click();
  await expect(shelf).toHaveAttribute("data-collapsed", "false");
});

test("the right rail holds the other view, and the swap trades them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const view = page.locator(".shell-panel-view");
  const eva = page.locator(".shell-panel-eva");
  const v = (await view.boundingBox())!;
  const e = (await eva.boundingBox())!;
  expect(v.y + v.height).toBeLessThanOrEqual(e.y);
  expect(e.height / v.height).toBeGreaterThan(1.7);
  expect(e.height / v.height).toBeLessThan(2.3);
  await expect(page.locator(".shell-main-hint")).toHaveAttribute(
    "data-view",
    "3d",
  );
  await expect(view.locator(".view-stub")).toHaveAttribute("data-view", "2d");
  // the small plan is the real plan, read-only, with the pieces on it
  await expect(view.locator(".view-mini .plan-svg")).toHaveCount(1);
  await expect(view.locator(".view-mini-piece")).toHaveCount(
    top.filter((a) => a.kind !== "fixed").length,
  );
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await expect(page.locator(".shell-main-hint")).toHaveAttribute(
    "data-view",
    "2d",
  );
  await expect(view.locator(".view-stub")).toHaveAttribute("data-view", "3d");
  // and the small 3D view is the room as an isometric box with its pieces
  await expect(view.locator(".view-mini-iso [data-face='top']")).toHaveCount(
    top.filter((a) => a.kind !== "fixed").length,
  );
  await page.getByRole("button", { name: "Show 3D view in main" }).click();
  await expect(page.locator(".shell-main-hint")).toHaveAttribute(
    "data-view",
    "3d",
  );
});

test("the outliner draws hierarchy lines and the Products tab adds to the room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const tree = page.getByRole("tree", { name: "Assets" });
  // a child row carries a guide back to its parent
  const segA = tree.locator(".assets-row", { hasText: "Segment A" });
  await expect(segA.locator(".assets-guide")).toHaveCount(2);
  // the sub-bar's hairline spans the panel like the head's
  const head = (await page
    .locator(".shell-rail-left .shell-panel-head")
    .boundingBox())!;
  const sub = (await page
    .locator(".shell-rail-left .shell-subbar")
    .boundingBox())!;
  expect(Math.abs(sub.width - head.width)).toBeLessThanOrEqual(1);

  await page.getByRole("tab", { name: "Products" }).click();
  await expect(page.locator(".product")).toHaveCount(products.length);
  await page.getByRole("searchbox", { name: "Search products" }).fill("coat");
  await expect(page.locator(".product")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Add Coat stand to the room" })
    .click();
  // adding from Products keeps you in Products
  await expect(page.getByRole("tab", { name: "Products" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: /Saved/ })).toHaveText(
    `Saved${totals.pieces + 1}`,
  );
  await page.getByRole("tab", { name: "Assets" }).click();
  await expect(page.locator(".main-shelf-sum")).toContainText(
    `${sgd(totals.total + coat.price)} · ${totals.pieces + 1} pieces`,
  );
  await page.getByRole("searchbox", { name: "Search assets" }).fill("coat");
  await expect(
    tree.locator(".assets-row", { hasText: "Coat stand" }),
  ).toBeVisible();
});

test("Eva's History lists conversations without an input box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await expect(
    page.getByRole("textbox", { name: "Message Eva" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("textbox", { name: "Message Eva" })).toHaveCount(
    0,
  );
  const rows = page.locator(".eva-conv");
  await expect(rows).toHaveCount(5);
  await expect(page.locator(".eva-day-label").first()).toHaveText("Today");
  await expect(rows.first()).toHaveAttribute("data-active", "true");
  // a row's three dots hold what can be done with it
  await rows.nth(2).hover();
  await rows
    .nth(2)
    .getByRole("button", { name: /^More for/ })
    .click();
  const menu = page.getByRole("menu", { name: /actions$/ });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open",
    "Rename",
    "Delete",
  ]);
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(rows).toHaveCount(4);
  // opening one goes back to the conversation
  await rows.nth(1).locator(".eva-conv-open").click();
  await expect(page.getByRole("tab", { name: "Agent" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("textbox", { name: "Message Eva" }),
  ).toBeVisible();
});

test("Eva's Preference blocks take a room, a budget, styles and colours", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Preference" }).click();
  await expect(page.getByRole("textbox", { name: "Message Eva" })).toHaveCount(
    0,
  );
  const blocks = page.locator(".eva-pref");
  await expect(blocks).toHaveCount(5);
  // two came from the chat, say so, and read as set
  // nothing says who set a block: everything here is what Eva keeps to
  await expect(page.locator(".eva-pref-origin")).toHaveCount(0);
  await expect(blocks.nth(0)).toHaveAttribute("data-set", "true");
  // pick a room (single), a colour (multi), slide the budget
  await page.getByRole("radio", { name: "Bedroom" }).click();
  await expect(blocks.nth(0).locator(".eva-pref-hint")).toHaveText("Bedroom");
  // options of one's own, typed: three at most per block
  const style = blocks.nth(2);
  for (const own of ["Loft", "Wabi-sabi", "Art deco"]) {
    await style.getByRole("button", { name: "+ Your own" }).click();
    await style
      .getByRole("textbox", { name: /Your own design style/ })
      .fill(own);
    await page.keyboard.press("Enter");
    await expect(style.getByRole("checkbox", { name: own })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
  await expect(style.getByRole("button", { name: "+ Your own" })).toHaveCount(
    0,
  );
  await style.getByRole("button", { name: "Remove Loft" }).click();
  await expect(style.getByRole("button", { name: "+ Your own" })).toHaveCount(
    1,
  );
  await expect(style.getByRole("checkbox", { name: "Loft" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Walnut" }).click();
  await page.getByRole("checkbox", { name: "Sage" }).click();
  await expect(blocks.nth(3).locator(".eva-pref-hint")).toHaveText(
    "Walnut · Sage",
  );
  await page.getByRole("spinbutton", { name: /Budget from/ }).fill("1000");
  await page.getByRole("spinbutton", { name: /Budget to/ }).fill("3000");
  await expect(blocks.nth(1).locator(".eva-pref-hint")).toHaveText(
    "S$1,000 to S$3,000",
  );
  await blocks.nth(0).getByRole("button", { name: "Remove" }).click();
  await expect(blocks.nth(0)).toHaveAttribute("data-set", "false");
  // exploration: the preferences stand aside; Eva says so; the toolbar's
  // gear holds the same switch and the way here
  const explore = page.getByRole("switch", { name: "Exploration" });
  await expect(explore).toHaveAttribute("aria-checked", "false");
  await explore.click();
  await expect(page.locator(".eva-prefs")).toHaveAttribute(
    "data-exploring",
    "true",
  );
  await expect(blocks.nth(0)).toHaveCSS("pointer-events", "none");
  await page.getByRole("tab", { name: "Agent" }).click();
  await expect(page.locator(".agent-exploring")).toBeVisible();
  await page.getByRole("button", { name: "Eva's preferences" }).click();
  const check = page.getByRole("menuitemcheckbox", { name: /Exploration/ });
  await expect(check).toHaveAttribute("aria-checked", "true");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menuitem", { name: "Set preferences by hand" }).click();
  await expect(page.getByRole("tab", { name: "Preference" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(explore).toHaveAttribute("aria-checked", "false");
});

test("the view panel drags down to give Eva more, and no higher than its third", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const view = page.locator(".shell-panel-view");
  const eva = page.locator(".shell-panel-eva");
  const handle = page.getByRole("separator", { name: "Resize the view panel" });
  const v0 = (await view.boundingBox())!;
  const e0 = (await eva.boundingBox())!;
  const hb = (await handle.boundingBox())!;
  const y = hb.y + hb.height / 2;
  await page.mouse.move(hb.x + hb.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, y - 120, { steps: 6 });
  await page.mouse.up();
  const v1 = (await view.boundingBox())!;
  const e1 = (await eva.boundingBox())!;
  expect(v1.height).toBeLessThan(v0.height - 100);
  expect(e1.height).toBeGreaterThan(e0.height + 100);
  // dragging back down stops at the third it started with
  const hb1 = (await handle.boundingBox())!;
  await page.mouse.move(hb1.x + hb1.width / 2, hb1.y + hb1.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb1.x + hb1.width / 2, hb1.y + 400, { steps: 6 });
  await page.mouse.up();
  const v2 = (await view.boundingBox())!;
  expect(Math.abs(v2.height - v0.height)).toBeLessThan(2);
  // the keyboard does the same
  await handle.focus();
  await page.keyboard.press("ArrowUp");
  const v3 = (await view.boundingBox())!;
  expect(v3.height).toBeLessThan(v0.height - 20);
});

test("the toolbar reads mode · select, add, wall · undo, guide, export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const bar = page.getByRole("toolbar", { name: "Studio tools" });
  await expect(bar.getByRole("button", { name: "Edit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    bar.getByRole("group", { name: "Tools" }).getByRole("button"),
  ).toHaveText(["", "", ""]);
  for (const gone of [
    "Move",
    "Rotate",
    "Measure",
    "Note",
    "Share",
    "Draw wall",
  ])
    await expect(bar.getByRole("button", { name: gone })).toHaveCount(0);
  await expect(bar.getByText("100%")).toHaveCount(0);
  // nothing to undo yet: both grey
  await expect(bar.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Redo" })).toBeDisabled();
  // the view angle: a perspective or a side in 3D, the plan or an
  // elevation in 2D
  const cube = page.getByRole("radiogroup", { name: "View angle" });
  await expect(cube.getByRole("radio")).toHaveCount(6);
  await expect(
    cube.getByRole("radio", { name: "Perspective" }),
  ).toHaveAttribute("aria-checked", "true");
  await cube.getByRole("radio", { name: "Top" }).click();
  await expect(page.locator(".view-cube-name")).toHaveText("Top");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await expect(cube.getByRole("radio")).toHaveCount(5);
  await expect(cube.getByRole("radio", { name: "Plan" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Show 3D view in main" }).click();
  await bar.getByRole("button", { name: "Inspect" }).click();
  await expect(bar.getByRole("button", { name: "Inspect" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(bar.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await bar.getByRole("button", { name: "Preview" }).click();
  await expect(bar.getByRole("button", { name: "Preview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await bar.getByRole("button", { name: "Edit" }).click();
  const [edit, tools, exp] = await Promise.all([
    bar.getByRole("button", { name: "Edit" }).boundingBox(),
    bar.getByRole("group", { name: "Tools" }).boundingBox(),
    bar.getByRole("button", { name: "Export" }).boundingBox(),
  ]);
  expect(edit!.x).toBeLessThan(tools!.x);
  expect(tools!.x + tools!.width).toBeLessThan(exp!.x);
});

test("the catalogue is grouped under titled categories", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Products" }).click();
  const titles = page.locator(".products-title");
  await expect(titles.first()).toContainText("Components");
  const n = new Set(products.map((p) => p.category)).size;
  await expect(titles).toHaveCount(n);
});

test("the Room tab starts from the HDB preset and takes a size of your own", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  // before the choice, only the choice
  await expect(page.getByRole("radio", { name: "4-room" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Template" }).click();
  await expect(page.getByRole("radio", { name: "4-room" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator(".room-size")).toContainText(
    "6.5 m × 4.0 m · 2.6 m high",
  );
  await expect(page.locator(".room-size")).toContainText(
    "typical for a 4-room",
  );
  await page.getByRole("radio", { name: "Master bedroom" }).click();
  await expect(page.locator(".room-size")).toContainText("3.5 m × 3.0 m");
  await page.getByRole("radio", { name: "3-room" }).click();
  await expect(page.locator(".room-size")).toContainText("3.0 m × 3.0 m");
  await expect(page.getByRole("radio", { name: "Study" })).toHaveCount(0);
  await page
    .getByRole("spinbutton", { name: "width in millimetres" })
    .fill("3400");
  await expect(page.locator(".room-size")).toContainText("3.4 m × 3.0 m");
  await expect(page.locator(".room-size")).toContainText("yours");
  await page.getByRole("button", { name: "Typical" }).click();
  await expect(page.locator(".room-size")).toContainText(
    "typical for a 3-room",
  );
  await page.getByRole("radio", { name: "east" }).first().click();
  await expect(
    page
      .getByRole("radiogroup", { name: "Door on the" })
      .getByRole("radio", { name: "east" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("Preview runs a line along the top, sweeps the render in, then compares on demand", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  // the run's lengths are tokens; the test shortens them
  await page.addStyleTag({
    content: ":root{--preview-generate:1.2s;--preview-reveal:.3s}",
  });
  const bar = page.getByRole("toolbar", { name: "Studio tools" });
  await bar.getByRole("button", { name: "Preview" }).click();
  const line = page.getByRole("progressbar", { name: "Rendering preview" });
  await expect(line).toBeAttached();
  await expect
    .poll(async () => (await line.boundingBox())?.width ?? 0)
    .toBeGreaterThan(0);
  // the line is the toolbar's own bottom edge
  const [lb, bb] = await Promise.all([line.boundingBox(), bar.boundingBox()]);
  expect(Math.abs(lb!.y + lb!.height - (bb!.y + bb!.height))).toBeLessThan(2);
  expect(lb!.x).toBeGreaterThanOrEqual(bb!.x);
  await expect(bar.getByRole("button", { name: "Select" })).toBeDisabled();
  // the eye keeps its colour while previewing: looking is what preview is for
  await expect(bar.getByRole("button", { name: "Hide panels" })).toBeEnabled();
  await expect(page.locator(".preview")).toHaveAttribute(
    "data-status",
    "done",
    { timeout: 8000 },
  );
  // the stage is full screen, behind the panels, and shows the gradient
  const stageBox = (await page.locator(".shell-stage").boundingBox())!;
  expect(stageBox.width).toBe(1440);
  expect(stageBox.x).toBe(0);
  await expect(page.locator(".preview-after")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  // the sweep runs between the rails and ends at the right one: all render
  const sb = (await page.locator(".preview-stage").boundingBox())!;
  const [leftRail, rightRail] = await Promise.all([
    page.locator(".shell-rail-left").boundingBox(),
    page.locator(".shell-rail-right").boundingBox(),
  ]);
  expect(Math.abs(sb.x - (leftRail!.x + leftRail!.width))).toBeLessThan(2);
  expect(Math.abs(sb.x + sb.width - rightRail!.x)).toBeLessThan(2);
  const handle = page.getByRole("slider", { name: "Before and after" });
  await expect(handle).toHaveAttribute("aria-valuenow", "100");
  // comparing is for looking: it comes with the panels hidden
  const compare = page.getByRole("button", {
    name: "Compare before and after",
  });
  await expect(compare).toHaveCount(0);
  await bar.getByRole("button", { name: "Hide panels" }).click();
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(page.locator(".preview")).toHaveAttribute(
    "data-status",
    "compare",
  );
  await expect(handle).toHaveAttribute("aria-valuenow", "50");
  // Before left of the line, Rendered right of it, both at the top
  const [before, after] = await Promise.all([
    page.locator(".preview-tag", { hasText: "Before" }).boundingBox(),
    page.locator(".preview-tag", { hasText: "Rendered" }).boundingBox(),
  ]);
  const mid = sb.x + sb.width / 2;
  expect(before!.x + before!.width).toBeLessThan(mid);
  expect(after!.x).toBeGreaterThan(mid);
  expect(before!.y).toBeLessThan(120);
  expect(after!.y).toBeLessThan(120);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "52");
  await page.mouse.move(sb.x + sb.width * 0.8, 300);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.25, 300, { steps: 4 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "25");
  // the panels back: the compare is left, the render stands whole
  await page.getByRole("button", { name: "Show panels" }).click();
  await expect(page.locator(".preview")).toHaveAttribute("data-status", "done");
  await expect(handle).toHaveAttribute("aria-valuenow", "100");
  await bar.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".preview")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Select" })).toBeEnabled();
});

test("a first visit opens the welcome and the tour; the Guide mark runs it again", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // from the toolbar: the same welcome, large and in the middle
  await page.getByRole("button", { name: "Guide" }).click();
  const welcome = page.getByRole("dialog", { name: "Welcome to the studio" });
  await expect(welcome).toBeVisible();
  const wb = (await welcome.boundingBox())!;
  expect(wb.width).toBeGreaterThan(500);
  expect(Math.abs(wb.x + wb.width / 2 - 720)).toBeLessThan(4);
  expect(Math.abs(wb.y + wb.height / 2 - 450)).toBeLessThan(4);
  // each step puts the focus border on a panel and says what it does
  await welcome.getByRole("button", { name: "Start the tour" }).click();
  const spot = page.locator(".tour-spot");
  const rail = (await page.locator(".shell-rail-left").boundingBox())!;
  await expect
    .poll(async () => (await spot.boundingBox())!.x)
    .toBeLessThan(rail.x + 1);
  const sb = (await spot.boundingBox())!;
  expect(Math.abs(sb.width - rail.width - 8)).toBeLessThan(2);
  const card = page.getByRole("dialog", { name: "The project panel" });
  await expect(card).toBeVisible();
  expect((await card.boundingBox())!.x).toBeGreaterThan(rail.x + rail.width);
  await card.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "The toolbar" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(card).toBeVisible();
  // skip ends it from any step
  await card.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // a first visit (a browser with nothing remembered): the welcome opens
  // by itself; once skipped it stays away after a reload
  const fresh = await (await browser.newContext()).newPage();
  await fresh.setViewportSize({ width: 1440, height: 900 });
  await fresh.goto("/rounded");
  const intro = fresh.getByRole("dialog", { name: "Welcome to the studio" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Skip" }).click();
  await fresh.reload();
  await expect(fresh.getByRole("dialog")).toHaveCount(0);
  await fresh.context().close();
});

test("the Room tab starts from drawn walls or a template", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  const start = page.getByRole("radiogroup", { name: "Start from" });
  await expect(start.getByRole("radio")).toHaveCount(2);
  await start.getByRole("radio", { name: "Draw walls" }).click();
  const howTo = page.getByRole("dialog", { name: "How to draw walls" });
  await expect(howTo).toBeVisible();
  await expect(page.locator(".shell-main-hint")).toHaveAttribute(
    "data-view",
    "2d",
  );
  const [hb, mb] = await Promise.all([
    howTo.boundingBox(),
    page.locator(".shell-main").boundingBox(),
  ]);
  expect(hb!.x).toBeGreaterThan(mb!.x + mb!.width / 2);
  await expect(howTo.getByText("Don't show next time")).toBeVisible();
  await howTo.getByRole("button", { name: "Close guide" }).click();
  await expect(page.getByRole("button", { name: "Show me how" })).toBeVisible();
  // drawing: the size comes from the walls, so no size block; the door and
  // window wait for walls; the flat and room stay, to name the room
  const titles = page.locator(".room .eva-pref-title");
  await expect(titles.filter({ hasText: /^Walls$/ })).toBeVisible();
  await expect(page.getByText("No walls yet")).toBeVisible();
  await expect(titles.filter({ hasText: /^Size$/ })).toHaveCount(0);
  await expect(page.locator(".eva-pref[data-muted='true']")).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "4-room" })).toBeVisible();
  await start.getByRole("radio", { name: "Template" }).click();
  await expect(titles.filter({ hasText: /^Size$/ })).toBeVisible();
  await expect(page.locator(".eva-pref[data-muted='true']")).toHaveCount(0);
  const shapes = page.getByRole("radiogroup", { name: "Room shape" });
  await expect(shapes.getByRole("radio")).toHaveCount(ROOM_TEMPLATES.length);
  await expect(shapes.locator("polygon").first()).toBeVisible();
  const l = ROOM_TEMPLATES.find((t) => t.id === "l-right")!;
  await shapes.getByRole("radio", { name: l.name, exact: true }).click();
  await expect(
    shapes.getByRole("radio", { name: l.name, exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});

test("a pick on the shelf and in the outliner is the same pick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  const tree = page.getByRole("tree", { name: "Assets" });
  const sideboard = top.find((a) => a.name === "Three-bay sideboard")!;
  await shelf
    .getByRole("button", { name: sideboard.name, exact: true })
    .click();
  const row = tree.getByRole("treeitem", { name: sideboard.name });
  await expect(row).toHaveAttribute("aria-selected", "true");
  // the tint runs from the mark to the right edge, not over the guides
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const [rb, mb] = await Promise.all([
    row.boundingBox(),
    row.locator(".assets-row-main").boundingBox(),
  ]);
  expect(mb!.x).toBeGreaterThan(rb!.x + 20);
  expect(mb!.x + mb!.width).toBeGreaterThan(rb!.x + rb!.width - 4);
  await expect(shelf.locator(`[data-id="${sideboard.id}"]`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  // from another tab, a shelf pick brings the Assets tab back
  await page.getByRole("tab", { name: "Products" }).click();
  await shelf.getByRole("button", { name: first.name, exact: true }).click();
  await expect(page.getByRole("tab", { name: "Assets" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    tree.getByRole("treeitem", { name: first.name }),
  ).toHaveAttribute("aria-selected", "true");
  // a folded shelf unfolds for a pick in the outliner, and scrolls to it
  await page.getByRole("button", { name: "Hide pieces" }).click();
  await expect(shelf).toHaveAttribute("data-collapsed", "true");
  const lastPiece = [...top].reverse().find((a) => a.kind === "piece")!;
  await tree.getByRole("treeitem", { name: lastPiece.name }).click();
  await expect(shelf).toHaveAttribute("data-collapsed", "false");
  const card = shelf.locator(`[data-id="${lastPiece.id}"]`);
  await expect(card).toHaveAttribute("data-selected", "true");
  await expect(card).toBeInViewport();
  const scroll = (await shelf.locator(".main-shelf-scroll").boundingBox())!;
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(scroll.x + scroll.width + 1);
});

test("the + opens the strip of parts; a click adds, a drag places", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  const saved = shelf.getByRole("tab", { name: /Saved/ });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const strip = page.getByRole("dialog", { name: "Add to the room" });
  await expect(strip).toBeVisible();
  // one line of chips, no search, no hint
  await expect(strip.getByRole("searchbox")).toHaveCount(0);
  const chips = strip
    .getByRole("group", { name: "Category" })
    .getByRole("button");
  const tops = await chips.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
  const parts = products.filter((p) => p.category === "components");
  await strip.getByRole("button", { name: "Components" }).click();
  await expect(strip.locator(".add-tile")).toHaveCount(parts.length);
  const shelfTile = strip.getByRole("button", { name: /^Add Shelf,/ });
  await shelfTile.click();
  await expect(strip).toHaveCount(0);
  const n = totals.pieces;
  await expect(saved).toHaveText(`Saved${n + 1}`);
  await expect(
    page.getByRole("treeitem", { name: "Shelf", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // dragging a tile onto the room places another
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await strip
    .getByRole("button", { name: /^Add Divider,/ })
    .dragTo(page.locator(".shell-stage"), {
      targetPosition: { x: 420, y: 560 },
    });
  await expect(saved).toHaveText(`Saved${n + 2}`);
  await expect(
    page.getByRole("treeitem", { name: "Divider", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // and so does a card from the Products tab
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Products" }).click();
  await page
    .locator(".product", { hasText: coat.name })
    .dragTo(page.locator(".shell-stage"), {
      targetPosition: { x: 420, y: 560 },
    });
  await expect(saved).toHaveText(`Saved${n + 3}`);
  // a drop from Products keeps you in Products
  await expect(page.getByRole("tab", { name: "Products" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the shelf's Saved cards go to the Cart from a hover button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  const cart = shelf.getByRole("tab", { name: /Cart/ });
  const piece = top.find((a) => a.kind === "piece")!;
  const room = top.find((a) => a.kind !== "piece")!;
  const card = shelf.locator(`[data-id="${piece.id}"]`);
  const button = card.getByRole("button", {
    name: `Add ${piece.name} to the cart`,
  });
  await expect(button).toHaveCSS("opacity", "0");
  await card.hover();
  await expect(button).toHaveCSS("opacity", "1");
  await button.click();
  await expect(card).toHaveAttribute("data-in-cart", "true");
  await expect(cart).toHaveText("Cart1");
  await expect(
    shelf
      .locator(`[data-id="${room.id}"]`)
      .getByRole("button", { name: /cart/ }),
  ).toHaveCount(0);
  await cart.click();
  await expect(shelf.locator(".main-shelf-sum")).toHaveText(
    `${sgd(piece.price!)} · 1 piece`,
  );
  await expect(shelf.locator(".shelf-card")).toHaveCount(1);
  await expect(shelf.getByRole("button", { name: "Checkout" })).toBeVisible();
  // the remove shows on hover only
  const remove = shelf.getByRole("button", {
    name: `Remove ${piece.name} from the cart`,
  });
  await page.mouse.move(10, 10);
  await expect(remove).toHaveCSS("opacity", "0");
  await shelf.locator(".shelf-card").first().hover();
  await expect(remove).toHaveCSS("opacity", "1");
  await shelf
    .getByRole("button", { name: `Remove ${piece.name} from the cart` })
    .click();
  await expect(shelf.locator(".shelf-card")).toHaveCount(0);
  await expect(shelf.locator(".main-shelf-empty")).toBeVisible();
  await expect(cart).toHaveText("Cart0");
});

test("a view swap runs the quick line; the Agent tab hands prompts to the input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.addStyleTag({ content: ":root{--load-view:1.5s}" });
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const line = page.getByRole("progressbar", { name: "Switching view" });
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-kind", "view");
  await expect(line).toHaveCount(0, { timeout: 4000 });
  // Eva opens with what she has read and places to start
  const agent = page.locator(".agent");
  await expect(agent.getByText("Living & dining · 4-room HDB")).toBeVisible();
  await expect(agent.locator(".agent-prompt")).toHaveCount(4);
  const prompt = (await agent.locator(".agent-prompt").first().textContent())!;
  await agent.locator(".agent-prompt").first().click();
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await expect(box).toHaveValue(prompt);
  await expect(box).toBeFocused();
});

test("Inspect raises Details and Label over a piece; labels reach Eva, five at most", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  // the 3D view draws the room on a canvas; the plan draws the pieces as
  // buttons, which is where this test clicks them
  await expect(page.locator(".stage-3d canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const stage = page.locator(".stage-pieces");
  const pieces = top.filter((a) => a.kind === "piece");
  // the room's own items stand on the plan too, but only pieces are counted here
  await expect(stage.locator('.stage-piece[data-kind="piece"]')).toHaveCount(
    pieces.length,
  );
  // with Select, a click on a piece picks it everywhere
  const first = pieces[0]!;
  await stage.getByRole("button", { name: first.name, exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: first.name, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(stage.locator(".stage-actions")).toHaveCount(0);
  // with Inspect, the two actions rise over it
  await page.getByRole("button", { name: "Inspect" }).click();
  await stage.getByRole("button", { name: first.name, exact: true }).click();
  const actions = stage.getByRole("group", { name: `${first.name} actions` });
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Label" }).click();
  await expect(stage.locator('.stage-piece[data-labelled="true"]')).toHaveCount(
    1,
  );
  await expect(page.getByLabel("Label 1")).toBeVisible();
  const agent = page.locator(".agent");
  const chip = agent.getByRole("button", {
    name: new RegExp(`^1\\s*${first.name}$`),
  });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByRole("textbox", { name: "Message Eva" })).toHaveValue(
    `About 1 (${first.name}): `,
  );
  // five at a time: the sixth piece cannot be labelled
  for (const p of pieces.slice(1)) {
    await stage.getByRole("button", { name: p.name, exact: true }).click();
    await stage
      .getByRole("group", { name: `${p.name} actions` })
      .getByRole("button", { name: "Label" })
      .click();
  }
  await expect(agent.locator(".agent-label")).toHaveCount(5);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: /^Add Shelf,/ }).click();
  await page.getByRole("button", { name: "Inspect" }).click();
  await stage.getByRole("button", { name: "Shelf", exact: true }).click();
  await expect(
    stage
      .getByRole("group", { name: "Shelf actions" })
      .getByRole("button", { name: "Label" }),
  ).toBeDisabled();
  // Details shows the piece alone on a blank ground and opens the Detail tab
  await stage.getByRole("button", { name: first.name, exact: true }).click();
  await stage
    .getByRole("group", { name: `${first.name} actions` })
    .getByRole("button", { name: "Details" })
    .click();
  await expect(page.locator(".shell-stage")).toHaveAttribute(
    "data-focus",
    "true",
  );
  await expect(stage.locator(".stage-piece")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Detail" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Back to the room" }).click();
  await expect(page.locator(".shell-stage")).toHaveAttribute(
    "data-focus",
    "false",
  );
});

test("the Detail tab lists a piece's components and changes one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Detail" }).click();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect(page.locator(".assets-empty")).toBeVisible();
  const bookwall = top.find((a) => a.children?.length)!;
  await page
    .locator(".main-shelf")
    .getByRole("button", { name: bookwall.name, exact: true })
    .click();
  await page.getByRole("tab", { name: "Detail" }).click();
  await expect(page.locator(".detail-name")).toHaveText(bookwall.name);
  // the whole piece is in hand first: a colour set here reaches every part
  const parts = page.getByRole("radiogroup", { name: "Parts" });
  await expect(parts.getByRole("radio")).toHaveCount(
    bookwall.children!.length + 1,
  );
  await expect(
    parts.getByRole("radio", { name: /Whole piece/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "Colour" })).toBeVisible();
  await page.getByRole("radio", { name: "Sage" }).click();
  const segment = bookwall.children![0]!;
  await parts.getByRole("radio", { name: new RegExp(segment.name) }).click();
  await expect(page.getByRole("radio", { name: "Sage" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "Walnut" }).click();
  await expect(page.getByRole("radio", { name: "Walnut" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "Linen" }).click();
  const width = page.getByRole("spinbutton", {
    name: `${segment.name} width in millimetres`,
  });
  await width.fill("900");
  await expect(width).toHaveValue("900");
  // the change holds when the component is left and picked again
  await parts
    .getByRole("radio", { name: new RegExp(bookwall.children![1]!.name) })
    .click();
  await parts.getByRole("radio", { name: new RegExp(segment.name) }).click();
  await expect(width).toHaveValue("900");
  await expect(page.getByRole("radio", { name: "Linen" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("Eva answers a message; New chat opens a thread; suggestions fill the box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await box.fill("What sofa suits this room?");
  await box.press("Enter");
  const bubbles = page.locator(".agent-bubble");
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.nth(0)).toHaveAttribute("data-who", "you");
  await expect(bubbles.nth(1)).toHaveAttribute("data-who", "eva");
  await expect(box).toHaveValue("");
  // a new chat is a clean thread, listed first in History
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(bubbles).toHaveCount(0);
  await page.getByRole("button", { name: "Show suggestions" }).click();
  const chip = page
    .getByRole("group", { name: "Suggestions" })
    .getByRole("button")
    .first();
  const text = (await chip.textContent())!;
  await chip.click();
  await expect(box).toHaveValue(text);
});

test("the Wall tool traces a room on the plan; Clear forgets it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Start from" })
    .getByRole("radio", { name: "Draw walls" })
    .click();
  await page.getByRole("button", { name: "Close guide" }).click();
  const svg = page.locator(".plan-svg");
  await expect(svg).toHaveAttribute("data-drawing", "true");
  await expect(svg).toHaveCSS("cursor", "crosshair");
  const b = (await svg.boundingBox())!;
  // four corners, the fifth click back on the first closes the room
  const corners = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
    [0.3, 0.3],
  ] as const;
  for (const [fx, fy] of corners.slice(0, 4)) {
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  }
  await expect(page.locator(".plan-corner")).toHaveCount(4);
  await expect(page.locator(".plan-corner-first")).toHaveCount(1);
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await expect(page.locator(".plan-corner")).toHaveCount(0);
  await expect(page.getByText(/^4 walls · /)).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("No walls yet")).toBeVisible();
});

test("the plan reads as a drawing: hatched walls, a door swing, dimensions, a title", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const svg = page.locator(".plan-svg");
  await expect(svg.locator(".plan-wall")).toHaveCSS("stroke", /url/);
  await expect(svg.locator(".plan-swing")).toHaveCount(1);
  await expect(svg.locator(".plan-leaf")).toHaveCount(1);
  await expect(svg.locator(".plan-line")).toHaveCount(3);
  await expect(svg.locator(".plan-dim")).toHaveCount(2);
  await expect(svg.locator(".plan-north")).toHaveCount(1);
  await expect(svg.locator(".plan-title text").first()).toContainText("HDB");
  // the room's own items stand on the plan as quiet symbols
  await expect(
    page.locator('.stage-piece[data-kind="decor"]').first(),
  ).toBeVisible();
});

test("Export offers the view and the room as files; Undo and Redo follow the changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  // the Export menu names the current view's file and the room's JSON
  await page.getByRole("button", { name: "Export" }).click();
  const menu = page.getByRole("menu", { name: "Export" });
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  expect(mb.x).toBeGreaterThanOrEqual(0);
  expect(mb.x + mb.width).toBeLessThanOrEqual(1440);
  await expect(
    menu.getByRole("menuitem", { name: /3D view as PNG/ }),
  ).toBeVisible();
  const json = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: /JSON/ }).click();
  expect((await json).suggestedFilename()).toMatch(/\.json$/);
  await expect(menu).toHaveCount(0);
  // a change puts Undo on; Undo takes it back and puts Redo on
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Add to the room" })
    .getByRole("button", { name: new RegExp(`^Add ${coat.name},`) })
    .click();
  await expect(
    page.getByRole("treeitem", { name: coat.name, exact: true }),
  ).toBeVisible();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(
    page.getByRole("treeitem", { name: coat.name, exact: true }),
  ).toHaveCount(0);
  await expect(redo).toBeEnabled();
  await page.keyboard.press("Control+Shift+Z");
  await expect(
    page.getByRole("treeitem", { name: coat.name, exact: true }),
  ).toBeVisible();
});

test("Checkout reads the order back and hands over the list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const pieces = top.filter((a) => a.kind === "piece");
  const first = pieces[0]!;
  const card = page.locator(`.shelf-card[data-id="${first.id}"]`);
  await card.hover();
  await card
    .getByRole("button", { name: `Add ${first.name} to the cart` })
    .click();
  await page.getByRole("tab", { name: /^Cart/ }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  const dialog = page.getByRole("dialog", { name: "Your order" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(first.name)).toBeVisible();
  await expect(dialog.getByText(sgd(first.price ?? 0)).first()).toBeVisible();
  const csv = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download the list" }).click();
  expect((await csv).suggestedFilename()).toMatch(/shopping-list\.csv$/);
  // the list is a side door; the order itself goes on to delivery
  await expect(
    dialog.getByRole("button", { name: "Continue to delivery" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the gear opens Settings, the shortcuts and Help; keys drive the tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Settings" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  await expect(menu.getByRole("menuitem", { name: /Sign out/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByRole("link", { name: "Rounded" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  await menu.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  const keys = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(keys.locator("kbd").first()).toBeVisible();
  await keys.getByRole("button", { name: "Close" }).click();
  // the keys themselves
  await page.keyboard.press("i");
  await expect(page.getByRole("button", { name: "Inspect" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("2");
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page.keyboard.press("h");
  await expect(page.locator(".shell")).toHaveAttribute("data-ui", "hidden");
  await page.keyboard.press("h");
  await expect(page.locator(".shell")).toHaveAttribute("data-ui", "shown");
  await page.keyboard.press("Shift+?");
  await expect(keys).toBeVisible();
  await page.keyboard.press("Escape");
  // Help runs the tour again
  await page.getByRole("button", { name: "Settings" }).click();
  await menu.getByRole("menuitem", { name: "Help" }).click();
  await expect(page.locator(".tour-card[data-welcome='true']")).toBeVisible();
});

test("the studio arrives with its transitions and remembers the last view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await expect(page.locator("html")).toHaveAttribute("data-arrived", "true");
  await arrived(page);
  await expect(page.locator(".stage-3d canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await page
    .getByRole("radiogroup", { name: "View angle" })
    .getByRole("radio", { name: "Front" })
    .click();
  await page.reload();
  await expect(page.locator(".plan-svg")).toBeVisible();
  await expect(page.locator(".view-cube-name")).toHaveText("Front");
});

test("Select drags a piece about the plan, turns it, locks it; the eye hides, Remove takes it out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const stage = page.locator(".stage-pieces");
  const pieces = top.filter((a) => a.kind === "piece");
  const name = pieces[0]!.name;
  const body = stage.getByRole("button", { name, exact: true });
  // the plan fades up with a slight scale: measure once it stands still
  await page
    .locator(".plan")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const before = (await body.boundingBox())!;
  // a drag moves it, snapped; one Undo brings it back
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 + 60,
    before.y + before.height / 2 + 90,
    { steps: 6 },
  );
  await page.mouse.move(
    before.x + before.width / 2 + 120,
    before.y + before.height / 2 + 90,
    { steps: 6 },
  );
  await page.mouse.up();
  const after = (await body.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 60);
  expect(after.y).toBeGreaterThan(before.y + 40);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await body.boundingBox())!.x).toBeCloseTo(before.x, 0);
  // picked, it shows a turn handle; a turn swaps its footprint
  await body.click();
  await page.getByRole("button", { name: `Turn ${name}` }).click();
  // (small pieces keep a minimum size on the plan, so the swap is read as
  // narrower and deeper, not to the pixel)
  const turned = (await body.boundingBox())!;
  expect(turned.width).toBeLessThan(before.width);
  expect(turned.height).toBeGreaterThan(before.height * 2);
  // the Detail tab places it in millimetres, locks it (no handle, no drag)
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  const x = page.getByRole("spinbutton", {
    name: `${name} from the west wall in millimetres`,
  });
  await x.fill("1000");
  await x.press("Tab");
  await expect(
    page.locator(".detail-of").filter({ hasText: /1000 ·/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.getByRole("button", { name: `Turn ${name}` })).toHaveCount(
    0,
  );
  await expect(stage.locator(".stage-piece[data-locked='true']")).toHaveCount(
    1,
  );
  // the outliner's eye takes a piece off the stage and brings it back
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  const n0 = await stage.locator(".stage-piece").count();
  const row = page.getByRole("treeitem", { name: "Sofa", exact: true });
  await row.hover();
  await row.getByRole("button", { name: "Hide Sofa" }).click();
  await expect(stage.locator(".stage-piece")).toHaveCount(n0 - 1);
  await expect(row).toHaveAttribute("data-hidden", "true");
  await row.getByRole("button", { name: "Show Sofa" }).click();
  await expect(stage.locator(".stage-piece")).toHaveCount(n0);
  // Remove takes it out of the room; Undo brings it back
  await row.hover();
  await row.getByRole("button", { name: "Remove Sofa from the room" }).click();
  await expect(row).toHaveCount(0);
  await expect(stage.locator(".stage-piece")).toHaveCount(n0 - 1);
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("treeitem", { name: "Sofa", exact: true }),
  ).toBeVisible();
});

test("the cube's other 2D angles draw the wall's elevation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const cube = page.getByRole("radiogroup", { name: "View angle" });
  await cube.getByRole("radio", { name: "Front" }).click();
  const svg = page.locator(".elev-svg");
  await expect(svg).toHaveAttribute("aria-label", /^north wall/);
  await expect(svg.locator(".elev-piece")).toHaveCount(
    top.filter((a) => a.kind !== "fixed").length,
  );
  // the window is on the north wall by default, the door on the south
  await expect(svg.locator(".elev-opening")).toHaveCount(1);
  // a piece picked on the elevation is picked everywhere (the first row
  // stands nearest the north wall, so it is in front here)
  const first = top.filter((a) => a.kind === "piece")[0]!;
  await svg.getByRole("button", { name: first.name, exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: first.name, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await cube.getByRole("radio", { name: "Back" }).click();
  await expect(svg).toHaveAttribute("aria-label", /^south wall/);
  await expect(svg.locator(".elev-knob")).toHaveCount(1);
  await cube.getByRole("radio", { name: "Plan" }).click();
  await expect(page.locator(".plan-svg:not(.elev-svg)")).toBeVisible();
});

test("Eva keeps to the order of the work: the room's size first, a budget before a list, pieces with why they fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const agent = page.locator(".agent");
  // the stages: the room comes first while its walls are not set
  await expect(agent.locator(".agent-stage[aria-current='step']")).toHaveText(
    /Room/,
  );
  await expect(
    agent.getByRole("progressbar", { name: "Readiness" }),
  ).toBeVisible();
  // a room starter asks for a layout, which waits for the room's size
  await agent
    .getByRole("group", { name: "Start from a room" })
    .getByRole("button", { name: "Living room" })
    .click();
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText("room's size first");
  await agent.getByRole("button", { name: "Open the Room tab" }).click();
  await expect(
    page.getByRole("tab", { name: "Room", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("radiogroup", { name: "Start from" })
    .getByRole("radio", { name: "Template" })
    .click();
  await expect(agent.locator(".agent-stage[aria-current='step']")).toHaveText(
    /Preferences/,
  );
  // a list without a budget asks for one
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await box.fill("Give me a shopping list");
  await box.press("Enter");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText("budget");
  // a budget heard in a message is proposed; Keep confirms it
  await box.fill("Suggest storage for this wall under S$1,500");
  await box.press("Enter");
  const proposal = agent.getByRole("group", { name: "Budget range heard" });
  await expect(proposal).toBeVisible();
  await proposal.getByRole("button", { name: "Keep" }).click();
  await expect(proposal).toHaveAttribute("data-settled", "accepted");
  await expect(agent.locator(".agent-context")).toContainText(
    "S$500 – S$1,500",
  );
  // the pieces she picked say why, and go into the room
  const cards = agent.locator(".agent-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().locator(".agent-card-why")).toContainText(
    "storage",
  );
  const name = (await cards.first().locator(".agent-card-name").textContent())!;
  await cards.first().getByRole("button", { name: "Add to the room" }).click();
  await expect(cards.first()).toHaveAttribute("data-added", "true");
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await expect(page.getByRole("treeitem", { name, exact: true })).toBeVisible();
  // and more can be asked for
  await agent.getByRole("button", { name: "More options" }).last().click();
  await expect(agent.locator(".agent-cards")).toHaveCount(2);
  // the plan reads the budget against what is in the room
  await expect(agent.locator(".agent-plan")).toContainText(/of S\$1,500/);
});

test("projects: a new one starts clean, the first keeps its room, rename and delete", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const name = page.locator(".shell-project-name");
  const saved = page.getByRole("tab", { name: /^Saved/ });
  await expect(saved).toHaveText(`Saved${totals.pieces}`);
  // a change in the first project: a piece into the cart
  const card = page.locator(`.shelf-card[data-id="${first.id}"]`);
  await card.hover();
  await card
    .getByRole("button", { name: `Add ${first.name} to the cart` })
    .click();
  await expect(page.getByRole("tab", { name: /^Cart/ })).toHaveText("Cart1");
  // a new project: its own room, nothing in the cart, no conversations
  await page.getByRole("button", { name: /^Project, / }).click();
  await page.getByRole("menuitem", { name: "New project" }).click();
  await expect(name).toHaveText("Project 2");
  await expect(page.getByRole("tab", { name: /^Cart/ })).toHaveText("Cart0");
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("No conversations yet")).toBeVisible();
  // rename in place
  await page.getByRole("button", { name: /^Project, / }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Project name" });
  await input.fill("Study corner");
  await input.press("Enter");
  await expect(name).toHaveText("Study corner");
  // back to the first: its cart is as it was; and it survives a reload
  await page.getByRole("button", { name: /^Project, / }).click();
  await page.getByRole("menuitemradio", { name: "First project" }).click();
  await expect(page.getByRole("tab", { name: /^Cart/ })).toHaveText("Cart1");
  await page.waitForTimeout(900);
  await page.reload();
  await expect(name).toHaveText("First project");
  await expect(page.getByRole("tab", { name: /^Cart/ })).toHaveText("Cart1");
  await page.getByRole("button", { name: /^Project, / }).click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(2);
  // delete the other; the last one cannot go
  await page.getByRole("menuitemradio", { name: "Study corner" }).click();
  await page.getByRole("button", { name: /^Project, / }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(name).toHaveText("First project");
  await page.getByRole("button", { name: /^Project, / }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
});

test("with a model connected Eva's answer comes through the route; the thumbs and edit work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // the route is stood in for: what a model would answer, in its shape
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      message: string;
      context: { room: { id: string } };
    };
    expect(body.message).toBe("I want a calm Japandi living room");
    expect(body.context.room.id).toBe("living");
    await route.fulfill({
      json: {
        reply: {
          text: "Calm it is. Two pieces would anchor the wall.",
          proposals: [{ cat: "color", values: ["Warm neutrals"] }],
          cards: [
            {
              product: {
                id: "p-sideboard",
                name: "Three-bay sideboard",
                category: "storage",
                price: 360,
              },
              why: "in keeping with Japandi · fits the 6.5 m wall",
            },
          ],
          chips: [{ label: "Show me a bookwall", send: "Show me a bookwall" }],
        },
        model: "stand-in",
      },
    });
  });
  await page.goto("/rounded");
  const agent = page.locator(".agent");
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await box.fill("I want a calm Japandi living room");
  await box.press("Enter");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toHaveText("Calm it is. Two pieces would anchor the wall.");
  await expect(
    agent.getByRole("group", { name: "Colour preferences heard" }),
  ).toBeVisible();
  await expect(agent.locator(".agent-card")).toHaveCount(1);
  await expect(
    agent.getByRole("button", { name: "Show me a bookwall" }),
  ).toBeVisible();
  await expect(agent.locator(".agent-offline")).toHaveCount(0);
  // a thumb stays lit; the same thumb again takes it off
  const up = agent.getByRole("button", { name: "Helpful" }).last();
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "false");
  // edit and resend puts the words back in the box
  await agent.getByRole("button", { name: "Edit and resend" }).first().click();
  await expect(box).toHaveValue("I want a calm Japandi living room");
});

test("without a model the route says so and Eva answers from the rules, once noted", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const res = await page.request.post("/api/chat", {
    data: {
      message: "hi",
      thread: [],
      context: {
        room: {
          id: "living",
          flat: "4-room",
          width: 6500,
          depth: 4000,
          height: 2600,
          sized: false,
        },
        pieces: [],
        cart: [],
        prefs: {},
        exploration: false,
        rules: {
          walkway: 600,
          doorClear: true,
          windowClear: true,
          bedWall: "prefer",
          mustHave: ["sofa"],
          spacing: 0,
        },
      },
    },
  });
  expect(res.status()).toBe(503);
  expect(await res.json()).toEqual({ fallback: true, reason: "no-key" });
  const bad = await page.request.post("/api/chat", { data: { nope: 1 } });
  expect(bad.status()).toBe(400);
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await box.fill("What fits along a 3 m wall?");
  await box.press("Enter");
  await expect(page.locator(".agent-bubble[data-who='eva']")).toHaveCount(1);
  await expect(page.locator(".agent-offline")).toBeVisible();
});

test("in 3D a piece is dragged over the floor, the camera glides between angles, and Walk puts you in the room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const stage = page.locator(".stage-3d");
  await expect(stage.locator("canvas")).toHaveCount(1);
  await arrived(page);
  // the camera reports where it stands; Top takes it high, in a glide
  await expect
    .poll(async () => (await stage.getAttribute("data-cam")) ?? "")
    .toMatch(/\d/);
  const y = () =>
    Number((stage.getAttribute("data-cam") as unknown as string) ?? "0");
  void y;
  await page
    .getByRole("radiogroup", { name: "View angle" })
    .getByRole("radio", { name: "Top" })
    .click();
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-cam"))!.split(",")[1]),
    )
    .toBeGreaterThan(8);
  await page
    .getByRole("radiogroup", { name: "View angle" })
    .getByRole("radio", { name: "Perspective" })
    .click();
  await page.waitForTimeout(800);
  // a drag on a piece moves it over the floor, snapped to 50 mm and kept
  // inside the room; which piece stands under the press depends on the
  // perspective, so the moved one is read back from the kept project
  const first = top.filter((a) => a.kind === "piece")[0]!;
  const tag = stage.locator(".stage-3d-name", { hasText: first.name }).first();
  const t = (await tag.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y - 22);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2 + 60, t.y - 22, { steps: 8 });
  await page.mouse.move(t.x + t.width / 2 + 120, t.y - 22, { steps: 8 });
  await expect(stage).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-dragging", "false");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.waitForTimeout(900);
  const placed = await page.evaluate(() => {
    const kept = JSON.parse(
      localStorage.getItem("furnishes.projects") ?? "{}",
    ) as {
      projects?: {
        data?: {
          scene?: { overrides?: Record<string, { x?: number; y?: number }> };
        };
      }[];
    };
    return Object.values(
      kept.projects?.[0]?.data?.scene?.overrides ?? {},
    ).filter((o) => o.x !== undefined);
  });
  expect(placed).toHaveLength(1);
  expect(placed[0]!.x! % 50).toBe(0);
  expect(placed[0]!.y! % 50).toBe(0);
  expect(placed[0]!.x!).toBeGreaterThanOrEqual(0);
  // Walk: the camera drops to eye height; W moves it north; Esc leaves
  await page.getByRole("button", { name: "Walk the room" }).click();
  await expect(stage).toHaveAttribute("data-walk", "true");
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-cam"))!.split(",")[1]),
    )
    .toBeCloseTo(1.6, 1);
  const z0 = Number((await stage.getAttribute("data-cam"))!.split(",")[2]);
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  const z1 = Number((await stage.getAttribute("data-cam"))!.split(",")[2]);
  expect(z1).toBeLessThan(z0 - 0.3);
  await page.keyboard.press("Escape");
  await expect(stage).toHaveAttribute("data-walk", "false");
});

test("the quizzes work a result out and hand it to Eva as proposals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Preference" }).click();
  const quizzes = page.getByRole("group", { name: "Quizzes" });
  await expect(quizzes.getByRole("button")).toHaveCount(3);
  // the style quiz: five questions, a profile at the end
  await quizzes.getByRole("button", { name: "Style" }).click();
  const dialog = page.getByRole("dialog", { name: "Style quiz" });
  await expect(dialog.getByText("1 of 5")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Sunny balcony" }).click();
  await dialog.getByRole("checkbox", { name: "Cosy nook" }).click();
  await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Next" }).click();
  for (const w of ["Natural", "Warm", "Cosy"])
    await dialog.getByRole("checkbox", { name: w }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("radio", { name: /The green retreat/ }).click();
  for (const w of ["Linen", "Rattan", "Bouclé"])
    await dialog.getByRole("checkbox", { name: w }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("radio", { name: /Light and airy/ }).click();
  await expect(dialog.getByText("The Naturalist")).toBeVisible();
  await expect(dialog.locator(".quiz-palette span")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Hand to Eva" }).click();
  // Eva proposes the style and the colours; Keep sets the chips
  const agent = page.locator(".agent");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText("From your style quiz: The Naturalist");
  const style = agent.getByRole("group", { name: "Design style heard" });
  await expect(style).toContainText("Scandinavian");
  await style.getByRole("button", { name: "Keep" }).click();
  await page.getByRole("tab", { name: "Preference" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Scandinavian" }).first(),
  ).toHaveAttribute("aria-checked", "true");
  // the budget quiz is seven single choices and ends in a range
  await quizzes.getByRole("button", { name: "Budget" }).click();
  const budget = page.getByRole("dialog", { name: "Budget quiz" });
  for (const o of [
    "Flexible",
    "Living room",
    "Medium",
    "An empty room",
    "3 to 5 years",
    "Mid range",
    "Balanced",
  ])
    await budget.getByRole("radio", { name: new RegExp(`^${o}`) }).click();
  await expect(budget.locator(".quiz-q")).toHaveText(
    /^S\$[\d,]+ to S\$[\d,]+$/,
  );
  await budget.getByRole("button", { name: "Hand to Eva" }).click();
  await expect(
    page.locator(".agent").getByRole("group", { name: "Budget range heard" }),
  ).toBeVisible();
});

test("an order is placed with a delivery address, waits for payment, is listed and can be cancelled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const pieces = top.filter((a) => a.kind === "piece");
  const first = pieces[0]!;
  const card = page.locator(`.shelf-card[data-id="${first.id}"]`);
  await card.hover();
  await card
    .getByRole("button", { name: `Add ${first.name} to the cart` })
    .click();
  await page.getByRole("tab", { name: /^Cart/ }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue to delivery" }).click();
  // the address is checked: a bad postal code and phone are named
  await dialog.getByRole("textbox", { name: "Recipient" }).fill("Mei Lin");
  await dialog
    .getByRole("textbox", { name: "Address" })
    .fill("Blk 123 Bedok North Ave 3 #05-67");
  await dialog.getByRole("textbox", { name: "Postal code" }).fill("12");
  await dialog.getByRole("textbox", { name: "Phone" }).fill("123");
  await dialog.getByRole("button", { name: /^Place order/ }).click();
  await expect(dialog.getByText("Six digits")).toBeVisible();
  await expect(dialog.getByText("A Singapore number, 8 digits")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Postal code" }).fill("460123");
  await dialog.getByRole("textbox", { name: "Phone" }).fill("9123 4567");
  await dialog.getByRole("button", { name: /^Place order/ }).click();
  // placed: an order number, awaiting payment, the honest note; the cart empties
  await expect(dialog.locator(".order-placed")).toContainText("FN-");
  await expect(dialog.locator(".order-status")).toHaveText("Awaiting payment");
  await expect(
    dialog.getByText("Payment is not connected on this server"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("tab", { name: /^Cart/ })).toHaveText("Cart0");
  await page.getByRole("tab", { name: /^Saved/ }).click();
  await expect(card).toHaveAttribute("data-ordered", "true");
  await expect(
    card.getByRole("button", { name: `${first.name} is ordered` }),
  ).toBeDisabled();
  // the route itself says offline
  const res = await page.request.post("/api/checkout", {
    data: { orderId: "FN-TEST", total: 540, currency: "SGD" },
  });
  expect((await res.json()).mode).toBe("offline");
  // under the gear: Orders lists it; Cancel takes it back; it survives a reload
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Orders" }).click();
  const orders = page.getByRole("dialog", { name: "Orders" });
  await expect(orders.locator(".order")).toHaveCount(1);
  await expect(orders.locator(".order")).toContainText(first.name);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Orders" }).click();
  await orders.getByRole("button", { name: "Cancel order" }).click();
  await expect(orders.locator(".order-status")).toHaveText("Cancelled");
  await page.keyboard.press("Escape");
  await expect(card).toHaveAttribute("data-ordered", "false");
});

test("the planner's rules: the door's swing, the window, a walkway, each with a Fix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const health = page
    .locator(".agent")
    .getByRole("list", { name: "Room health" });
  await expect(health).toHaveCount(0);
  const first = top.filter((a) => a.kind === "piece")[0]!;
  await page.getByRole("treeitem", { name: first.name, exact: true }).click();
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  const x = page.getByRole("spinbutton", {
    name: `${first.name} from the west wall in millimetres`,
  });
  const y = page.getByRole("spinbutton", {
    name: `${first.name} from the north wall in millimetres`,
  });
  // into the door's swing (the door is on the south wall, 800 mm from the
  // east corner, as HDB has it: the zone runs 4800 to 5700 along the wall)
  await x.fill("4800");
  await x.press("Tab");
  await y.fill("3500");
  await y.press("Tab");
  await expect(health).toContainText(`${first.name} blocks the door's swing`);
  await expect(page.locator(".plan-zone")).toHaveCount(1);
  await health.getByRole("button", { name: /^Fix: .*door/ }).click();
  await expect(health.getByText(/blocks the door/)).toHaveCount(0);
  await expect(page.locator(".plan-zone")).toHaveCount(0);
  // tall, in front of the window (north wall, middle)
  const h = page.getByRole("spinbutton", {
    name: `${first.name} height in millimetres`,
  });
  await h.fill("1500");
  await h.press("Tab");
  await x.fill("2650");
  await x.press("Tab");
  await y.fill("0");
  await y.press("Tab");
  await expect(health).toContainText(`${first.name} blocks the window`);
  await health.getByRole("button", { name: /^Fix: .*window/ }).click();
  await expect(health.getByText(/blocks the window/)).toHaveCount(0);
  // too close to a neighbour for a walkway: 300 mm between two pieces
  const second = top.filter((a) => a.kind === "piece")[1]!;
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByRole("treeitem", { name: second.name, exact: true }).click();
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  const sx = page.getByRole("spinbutton", {
    name: `${second.name} from the west wall in millimetres`,
  });
  const sy = page.getByRole("spinbutton", {
    name: `${second.name} from the north wall in millimetres`,
  });
  await sx.fill("2000");
  await sx.press("Tab");
  await sy.fill("2600");
  await sy.press("Tab");
  await page.getByRole("tab", { name: "Assets", exact: true }).click();
  await page.getByRole("treeitem", { name: first.name, exact: true }).click();
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  await x.fill("3500");
  await x.press("Tab");
  await y.fill("2600");
  await y.press("Tab");
  const pair = new RegExp(
    `Only 300 mm between (${second.name} and ${first.name}|${first.name} and ${second.name})`,
  );
  const row = health.locator("li", { hasText: pair });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Fix/ }).click();
  await expect(health.locator("li", { hasText: pair })).toHaveCount(0);
});

test("the box's mode steers Eva: Furniture asks for pieces, Room layout for a layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const box = page.getByRole("textbox", { name: "Message Eva" });
  const agent = page.locator(".agent");
  // Furniture: words that name nothing still bring pieces
  await page.getByRole("button", { name: /^Ask/ }).click();
  await page.getByRole("menuitemradio", { name: "Furniture" }).click();
  await expect(box).toHaveAttribute("placeholder", /Which piece/);
  await box.fill("something for the corner by the window");
  await box.press("Enter");
  await expect(agent.locator(".agent-card").first()).toBeVisible();
  // Room layout: the room's size comes first, as the gate says
  await page.getByRole("button", { name: /^Furniture/ }).click();
  await page.getByRole("menuitemradio", { name: "Room layout" }).click();
  await box.fill("something for the corner by the window");
  await box.press("Enter");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText("room's size first");
});

test("the room knows its flat: what fits, where the door is, a kitchen without a window; Eva says where the money goes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Start from" })
    .getByRole("radio", { name: "Template" })
    .click();
  // the fit lines for a 4-room living room, then for a 3-room master
  const fit = page.getByRole("list", { name: "What fits" });
  await expect(fit).toContainText("L-shaped sofa 2.6 to 2.8 m");
  await page.getByRole("radio", { name: "3-room" }).click();
  await page.getByRole("radio", { name: "Master bedroom" }).click();
  await expect(fit).toContainText("A king bed will not fit");
  // the door by convention: 600 mm from the corner; the plan draws it there
  await expect(
    page.getByText("600 mm from the corner, as HDB has it"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  // the leaf hangs at the hinge: the door spans 1500 to 2400 on a 3000 wall
  const leaf = page.locator(".plan-leaf");
  expect(Number(await leaf.getAttribute("x1"))).toBe(3000 - 600 - 900);
  // the kitchen has no window of its own
  await page.getByRole("radio", { name: "Kitchen" }).click();
  await expect(page.getByText("No window of its own")).toBeVisible();
  await expect(page.locator(".plan-svg:not(.elev-svg) .plan-line")).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole("radiogroup", { name: "Window on the" })
      .getByRole("radio", { name: "none" }),
  ).toHaveAttribute("aria-checked", "true");
  // Eva keeps to the fit guidance, and splits a kept budget into bands
  await page.getByRole("radio", { name: "Master bedroom" }).click();
  const box = page.getByRole("textbox", { name: "Message Eva" });
  await box.fill("Will a king bed fit in here?");
  await box.press("Enter");
  const agent = page.locator(".agent");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText("A king bed will not fit");
  await box.fill("My budget is S$1,000 to S$3,000");
  await box.press("Enter");
  await agent
    .getByRole("group", { name: "Budget range heard" })
    .getByRole("button", { name: "Keep" })
    .click();
  await expect(
    agent.getByRole("list", { name: "Where the budget should go" }),
  ).toContainText("Storage");
  await box.fill("Where should the budget go?");
  await box.press("Enter");
  await expect(
    agent.locator(".agent-bubble[data-who='eva']").last(),
  ).toContainText(/storage S\$[\d,]+ to S\$[\d,]+/);
  // a kept style shows what it asks for
  await page.getByRole("tab", { name: "Preference" }).click();
  await expect(
    page
      .getByRole("definition")
      .filter({ hasText: "closed storage hides clutter" })
      .first(),
  ).toBeVisible();
});

test("Generate makes a room item from a few words; it stands as a shape without a provider", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  const saved = shelf.getByRole("tab", { name: /Saved/ });
  const n = totals.pieces;
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const strip = page.getByRole("dialog", { name: "Add to the room" });
  await strip
    .getByRole("group", { name: "Category" })
    .getByRole("button", { name: "Generate" })
    .click();
  const words = strip.getByRole("textbox", { name: "Describe a room item" });
  await expect(words).toBeVisible();
  // no key on this server: the item still arrives, as a shape, with a note
  await words.fill("a rattan armchair");
  await strip.locator("form").getByRole("button", { name: "Generate" }).click();
  await expect(
    strip.getByText("No image or mesh provider is connected"),
  ).toBeVisible();
  const tile = strip.locator(".add-tile-gen").filter({
    hasText: "Rattan armchair",
  });
  await expect(tile).toHaveCount(1);
  await expect(tile.locator(".add-tile-price")).toHaveText("shape");
  // the room has it, as a room item (not for sale, no price), selected
  const row = page.getByRole("treeitem", { name: "Rattan armchair" });
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(saved).toHaveText(`Saved${n}`);
  // starred ones can be shown on their own
  await tile.getByRole("button", { name: "Star Rattan armchair" }).click();
  await expect(
    tile.getByRole("button", { name: "Unstar Rattan armchair" }),
  ).toHaveAttribute("aria-pressed", "true");
  await words.fill("a tall fiddle-leaf fig");
  await words.press("Enter");
  await expect(strip.locator(".add-tile-gen")).toHaveCount(2);
  await strip.getByRole("button", { name: "Starred" }).click();
  await expect(strip.locator(".add-tile-gen")).toHaveCount(1);
  await expect(strip.locator(".add-gen-label")).toHaveText("Starred · 1");
  // a tile click adds another of it and closes the strip
  await tile.getByRole("button", { name: "Add Rattan armchair" }).click();
  await expect(strip).toHaveCount(0);
  await expect(
    page.getByRole("treeitem", { name: "Rattan armchair 2" }),
  ).toHaveAttribute("aria-selected", "true");
  // the generations survive a reload; one can be forgotten
  await page.reload();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await strip
    .getByRole("group", { name: "Category" })
    .getByRole("button", { name: "Generate" })
    .click();
  await expect(strip.locator(".add-tile-gen")).toHaveCount(2);
  await strip
    .getByRole("button", { name: "Forget Tall fiddle-leaf fig" })
    .click();
  await expect(strip.locator(".add-tile-gen")).toHaveCount(1);
  await expect(
    page.getByRole("treeitem", { name: "Tall fiddle-leaf fig" }),
  ).toHaveCount(1);
  // the route itself: no key says so, a bad body is refused
  const res = await page.request.post("/api/generate-item", {
    data: { prompt: "a paper pendant" },
  });
  expect(res.status()).toBe(503);
  expect(await res.json()).toEqual({ fallback: true, reason: "no-key" });
  const bad = await page.request.post("/api/generate-item", {
    data: { prompt: "a" },
  });
  expect(bad.status()).toBe(400);
});

test("a connected provider's picture shows on the tile and the item carries it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pic =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c96"/></svg>',
    );
  await page.route("**/api/generate-item", async (route) => {
    const body = route.request().postDataJSON() as { prompt: string };
    expect(body.prompt).toBe("a paper pendant");
    await route.fulfill({ json: { imageUrl: pic } });
  });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const strip = page.getByRole("dialog", { name: "Add to the room" });
  await strip
    .getByRole("group", { name: "Category" })
    .getByRole("button", { name: "Generate" })
    .click();
  await strip
    .getByRole("textbox", { name: "Describe a room item" })
    .fill("a paper pendant");
  await strip.locator("form").getByRole("button", { name: "Generate" }).click();
  const tile = strip.locator(".add-tile-gen").filter({
    hasText: "Paper pendant",
  });
  await expect(tile.locator(".add-tile-price")).toHaveText("picture");
  await expect(tile.locator(".add-tile-pic-btn")).toHaveCSS(
    "background-image",
    /^url\("data:image\/svg\+xml/,
  );
  await expect(
    strip.getByText("The picture came, the mesh did not"),
  ).toBeVisible();
  // a lamp: it files under lighting in the room's list
  await expect(
    page.getByRole("treeitem", { name: "Paper pendant" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("the room's rules shape the planner: the walkway, what is kept clear, a bed against a wall, what the room must have; three layouts to apply", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const health = page
    .locator(".agent")
    .getByRole("list", { name: "Room health" });
  await expect(health).toHaveCount(0);
  // the rules, at the end of the Room tab
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Start from" })
    .getByRole("radio", { name: "Template" })
    .click();
  const walkway = page.getByRole("slider", { name: "Walkway in millimetres" });
  await expect(walkway).toHaveValue("600");
  const typical = page
    .locator(".eva-pref", { hasText: "Rules" })
    .getByRole("button", { name: "Typical" });
  await expect(typical).toHaveCount(0);
  // two pieces 800 mm apart: fine at 600, too close at 1000
  const first = top.filter((a) => a.kind === "piece")[0]!;
  const second = top.filter((a) => a.kind === "piece")[1]!;
  const place = async (name: string, x: string, y: string) => {
    await page.getByRole("tab", { name: "Assets", exact: true }).click();
    await page.getByRole("treeitem", { name, exact: true }).click();
    await page.getByRole("tab", { name: "Detail", exact: true }).click();
    const sx = page.getByRole("spinbutton", {
      name: `${name} from the west wall in millimetres`,
    });
    const sy = page.getByRole("spinbutton", {
      name: `${name} from the north wall in millimetres`,
    });
    await sx.fill(x);
    await sx.press("Tab");
    await sy.fill(y);
    await sy.press("Tab");
  };
  await place(second.name, "2000", "2600");
  await place(first.name, "4000", "2600");
  await expect(health.getByText(/Only 800 mm/)).toHaveCount(0);
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await walkway.fill("1000");
  await expect(health).toContainText("Only 800 mm between");
  await expect(health).toContainText("1000 mm walks");
  // Typical brings the rules back
  await typical.click();
  await expect(walkway).toHaveValue("600");
  await expect(health.getByText(/Only 800 mm/)).toHaveCount(0);
  // the door's swing is kept clear only while asked
  await place(first.name, "4800", "3500");
  await expect(health).toContainText(`${first.name} blocks the door's swing`);
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  const doorSwing = page
    .getByRole("group", { name: "Keep clear" })
    .getByRole("button", { name: "Door swing" });
  await expect(doorSwing).toHaveAttribute("aria-pressed", "true");
  await doorSwing.click();
  await expect(health.getByText(/blocks the door/)).toHaveCount(0);
  await doorSwing.click();
  await expect(health).toContainText(`${first.name} blocks the door's swing`);
  await health.getByRole("button", { name: /^Fix: .*door/ }).click();
  // the three layouts: Along the walls leaves the middle open
  const layouts = page
    .locator(".agent")
    .getByRole("group", { name: "Layouts" });
  await expect(layouts.locator(".agent-layout")).toHaveCount(3);
  await expect(layouts.locator(".agent-layout-pick")).toHaveCount(1);
  const walls = layouts.locator(".agent-layout", {
    hasText: "Along the walls",
  });
  await expect(walls).toContainText("facing the south door");
  await walls.getByRole("button", { name: "Apply" }).click();
  await expect(walls.getByRole("button", { name: "Applied" })).toBeDisabled();
  await expect(layouts.getByRole("button", { name: "Apply" })).toHaveCount(2);
  // what the room must have: a bed asked for, missing, then added
  const mustHave = page.getByRole("group", { name: "Must have" });
  await expect(mustHave.getByRole("button", { name: "sofa" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await mustHave.getByRole("button", { name: "bed" }).click();
  await expect(health).toContainText("No bed in the room yet");
  await health
    .getByRole("button", { name: "Add: No bed in the room yet" })
    .click();
  await expect(health.getByText(/No bed/)).toHaveCount(0);
  await expect(
    page.getByRole("treeitem", { name: "Bed", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // a bed in the middle of the room would sit better against a wall
  await place("Bed", "2400", "1200");
  await expect(health).toContainText("Bed would sit better against a wall");
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Bed against a wall" })
    .getByRole("radio", { name: "Required" })
    .click();
  await expect(health).toContainText("Bed must stand against a wall");
  await health.getByRole("button", { name: /^Fix: Bed/ }).click();
  await expect(health.getByText(/Bed .*wall/)).toHaveCount(0);
  // Off asks nothing of the bed; Undo walks the changes back
  await page
    .getByRole("radiogroup", { name: "Bed against a wall" })
    .getByRole("radio", { name: "Off" })
    .click();
  await place("Bed", "2400", "1200");
  await expect(health.getByText(/Bed .*wall/)).toHaveCount(0);
});
