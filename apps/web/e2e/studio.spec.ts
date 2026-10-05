import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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
  await page.goto("/rounded");
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
  ["/studio", "square"],
  ["/rounded", "rounded"],
] as const) {
  test(`${path} lays out left | main | right (${corners})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await arrived(page);
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
    await arrived(page);
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
  await arrived(page);
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
  await page.getByRole("button", { name: "Ask · Chat" }).click();
  await page.getByRole("menuitemradio", { name: "Room layout" }).click();
  await expect(
    page.getByRole("button", { name: /^Room layout/ }),
  ).toBeVisible();

  await expect(page.locator(".user-name")).toHaveText("Guest");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
});

test("the outliner searches, filters and marks the pieces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await arrived(page);
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
  // the filter flies out to the right of the panel (measured once its
  // fly-out has landed)
  const filter = page.getByRole("dialog", { name: "Filter" });
  await filter.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
  const [menu, rail] = await Promise.all([
    filter.boundingBox(),
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
  await arrived(page);
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
  const small = view.locator(".view-mini .stage-piece");
  await expect(small).toHaveCount(top.filter((a) => a.kind !== "fixed").length);
  // its pieces are the stage's own: a click picks one, a drag moves it
  // (the 3D room follows), with no names or handles at that size
  const first = top.filter((a) => a.kind === "piece")[0]!;
  const piece = view
    .locator(".view-mini")
    .getByRole("button", { name: first.name, exact: true });
  await piece.click();
  await expect(piece).toHaveAttribute("aria-pressed", "true");
  await expect(view.locator(".view-mini .stage-piece-name")).toHaveCount(0);
  await expect(view.locator(".view-mini .stage-piece-turn")).toHaveCount(0);
  const pb = (await piece.boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width / 2 + 30, pb.y + pb.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.keyboard.press("Control+z");
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
  await arrived(page);
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
  ).toHaveText(["", "", "", "", ""]);
  for (const gone of ["Move", "Rotate", "Note", "Share", "Draw wall"])
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
  await bar.getByRole("button", { name: "Render" }).click();
  await expect(bar.getByRole("button", { name: "Render" })).toHaveAttribute(
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

test("Render runs a line along the top, sweeps the render in over the view, then compares on demand", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  // the run's lengths are tokens; the test shortens them (the line keeps
  // a few seconds: a software renderer's first frame can hold the page)
  await page.addStyleTag({
    content: ":root{--preview-generate:6s;--preview-reveal:.3s}",
  });
  const bar = page.getByRole("toolbar", { name: "Studio tools" });
  await bar.getByRole("button", { name: "Render" }).click();
  const line = page.getByRole("progressbar", { name: "Rendering the room" });
  await expect(line).toBeAttached();
  await expect
    .poll(async () => (await line.boundingBox())?.width ?? 0, {
      timeout: 8000,
    })
    .toBeGreaterThan(0);
  // the line is the toolbar's own bottom edge
  const [lb, bb] = await Promise.all([line.boundingBox(), bar.boundingBox()]);
  expect(Math.abs(lb!.y + lb!.height - (bb!.y + bb!.height))).toBeLessThan(2);
  expect(lb!.x).toBeGreaterThanOrEqual(bb!.x);
  await expect(bar.getByRole("button", { name: "Select" })).toBeDisabled();
  // the eye keeps its colour while rendering: looking is what a render is for
  await expect(bar.getByRole("button", { name: "Hide panels" })).toBeEnabled();
  await expect(page.locator(".preview")).toHaveAttribute(
    "data-status",
    "done",
    { timeout: 12000 },
  );
  // the stage is full screen, behind the panels; the render is the view
  // that was up (the 3D room, its shadows on and its names away), graded
  const stageBox = (await page.locator(".shell-stage").boundingBox())!;
  expect(stageBox.width).toBe(1440);
  expect(stageBox.x).toBe(0);
  await expect(page.locator(".preview-after")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".stage-3d canvas")).toBeVisible();
  await expect(page.locator(".stage-3d")).toHaveAttribute(
    "data-shadows",
    "true",
  );
  await expect(page.locator(".stage-3d .stage-3d-name")).toHaveCount(0);
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

test("the gear opens Settings, Help and the Guide; keys drive the tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  await expect(menu.getByRole("menuitem", { name: "Feedback" })).toHaveCount(1);
  await expect(menu.getByRole("menuitem", { name: "Sign in" })).toHaveCount(1);
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByRole("link", { name: "Rounded" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // the wheel's meaning on the plan: Auto by default, Scroll kept
  const wheel = settings.getByRole("radiogroup", {
    name: "Scroll wheel on the plan",
  });
  await expect(wheel.getByRole("radio", { name: "Auto" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await wheel.getByRole("radio", { name: "Scroll" }).click();
  await expect(settings).toContainText("the wheel always moves the sheet");
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await page.keyboard.press("2");
  const sheet = page.locator(".shell-stage .plan");
  const box = (await page.locator(".shell-stage .plan-svg").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await expect(sheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -120)");
  // a pinch (the wheel with Control) zooms whatever the setting
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(sheet).toHaveCSS("transform", /matrix\(2\.7/);
  await page.keyboard.press("0");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(wheel.getByRole("radio", { name: "Scroll" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await wheel.getByRole("radio", { name: "Auto" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await menu.getByRole("menuitem", { name: "Help" }).click();
  // Help opens on the mouse under a mouse; the tabs switch what it shows
  const help = page.getByRole("dialog", { name: "Help" });
  const tabs = help.getByRole("tablist", { name: "Help" });
  await expect(
    tabs.getByRole("tab", { name: "Mouse & trackpad" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(help.getByRole("tabpanel")).toContainText(
    "A notch of the wheel, or a pinch on the trackpad",
  );
  await tabs.getByRole("tab", { name: "Touch" }).click();
  await expect(help.getByRole("tabpanel")).toContainText("Press and hold it");
  await tabs.getByRole("tab", { name: "Keyboard" }).click();
  await expect(help.locator("kbd").first()).toBeVisible();
  await help.getByRole("button", { name: "Close" }).click();
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
  // ? opens Help on the keyboard
  await page.keyboard.press("Shift+?");
  await expect(help).toBeVisible();
  await expect(help.getByRole("tab", { name: "Keyboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  // Guide runs the tour again
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await menu.getByRole("menuitem", { name: "Guide" }).click();
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
  // a drag on a piece moves it over the floor, snapped to 50 mm; the
  // rest are held where they stood, so no other piece shifts: every
  // piece is read back from the kept project with a place on the grid
  const first = top.filter((a) => a.kind === "piece")[0]!;
  // the names come on to find the piece (none show until asked)
  await expect(stage).toHaveAttribute("data-hover", "none");
  await page.getByRole("button", { name: "View settings" }).click();
  await page
    .getByRole("menu", { name: "View settings" })
    .getByRole("menuitemcheckbox", { name: "Names under the pieces" })
    .click();
  await page.keyboard.press("Escape");
  const tag = stage.locator(".stage-3d-name", { hasText: first.name }).first();
  const t = (await tag.boundingBox())!;
  // over the piece the canvas shows a hand: it can be dragged
  await page.mouse.move(t.x + t.width / 2, t.y - 22);
  await expect(stage).toHaveAttribute("data-hover", "grab");
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
  expect(placed).toHaveLength(top.filter((a) => a.kind !== "fixed").length);
  // on the grid (a piece may stand past a wall, so a side can be negative)
  for (const o of placed) {
    expect(Math.abs(o.x! % 50)).toBe(0);
    expect(Math.abs(o.y! % 50)).toBe(0);
  }
  // the piece goes back (the walk below starts where it now stands)
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  // Walk: the camera drops to eye height; W moves it north; Esc leaves
  await page.getByRole("button", { name: "Walk the room" }).click();
  await expect(stage).toHaveAttribute("data-walk", "true");
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-cam"))!.split(",")[1]),
    )
    .toBeCloseTo(1.6, 1);
  const z0 = Number((await stage.getAttribute("data-cam"))!.split(",")[2]);
  // W held until the camera has gone north (a software renderer gives
  // few frames a second, so this is read, not timed)
  await page.keyboard.down("w");
  await expect
    .poll(
      async () => Number((await stage.getAttribute("data-cam"))!.split(",")[2]),
      { timeout: 8000 },
    )
    .toBeLessThan(z0 - 0.3);
  await page.keyboard.up("w");
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Orders" }).click();
  const orders = page.getByRole("dialog", { name: "Orders" });
  await expect(orders.locator(".order")).toHaveCount(1);
  await expect(orders.locator(".order")).toContainText(first.name);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
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
  await page.getByRole("button", { name: "Ask · Chat" }).click();
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

test("the plan's tools: the wheel and the keys zoom it, a drag pans it, Fit brings it back, Measure reads a distance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  // the zoom controls belong to the plan: none in 3D
  await expect(page.getByRole("group", { name: "Plan zoom" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const zoom = page.getByRole("group", { name: "Plan zoom" });
  await expect(zoom).toBeVisible();
  const sheet = page.locator(".shell-stage .plan");
  await expect(sheet).toHaveAttribute("data-zoomed", "false");
  await expect(
    zoom.getByRole("button", { name: "Fit the plan", exact: true }),
  ).toBeDisabled();
  // the keys and the buttons
  await page.keyboard.press("+");
  await expect(sheet).toHaveAttribute("data-zoomed", "true");
  await expect(
    zoom.getByRole("button", { name: /^Zoom 115 percent/ }),
  ).toBeVisible();
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await expect(
    zoom.getByRole("button", { name: /^Zoom 132 percent/ }),
  ).toBeVisible();
  await page.keyboard.press("0");
  await expect(sheet).toHaveAttribute("data-zoomed", "false");
  // the wheel zooms about the pointer
  const svg = page.locator(".shell-stage .plan-svg");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect(
    zoom.getByRole("button", { name: /^Zoom 212 percent/ }),
  ).toBeVisible();
  await expect(sheet).toHaveCSS("transform", /matrix\(2\.1/);
  // a drag on the sheet (from its margin, at 100 percent) pans it
  await zoom.getByRole("button", { name: "Fit the plan", exact: true }).click();
  await expect(sheet).toHaveAttribute("data-zoomed", "false");
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 100, 60)");
  await expect(sheet).toHaveAttribute("data-zoomed", "true");
  await zoom.getByRole("button", { name: "Fit the plan", exact: true }).click();
  await expect(sheet).toHaveAttribute("data-zoomed", "false");
  // the sheet glides back; the clicks below are placed once it has landed
  await sheet.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
  // Measure: two clicks, the distance in millimetres, snapped to 50
  await page.getByRole("button", { name: "Measure" }).click();
  await expect(page.getByRole("button", { name: "Measure" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const vw = 6500 + 2 * 1100;
  const vh = 4000 + 2 * 1100;
  const at = (x: number, y: number) => ({
    x: box.x + ((x + 1100) / vw) * box.width,
    y: box.y + ((y + 1100) / vh) * box.height,
  });
  const a = at(1000, 1000);
  const b = at(4000, 1000);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  // a pixel is some 20 mm here and the reading snaps to 50 on each axis,
  // so a reading is within 75 (both axes short, on the slant)
  const read = svg.locator(".plan-measure text");
  const near = async (want: number[]) => {
    const got = ((await read.textContent()) ?? "").match(/\d+/g)!.map(Number);
    expect(got.length).toBe(want.length);
    got.forEach((g, i) =>
      expect(Math.abs(g - want[i]!)).toBeLessThanOrEqual(75),
    );
  };
  await expect(read).toContainText("mm");
  await near([3000]);
  await page.mouse.click(b.x, b.y);
  await expect(svg.locator(".plan-measure")).toHaveAttribute(
    "data-set",
    "true",
  );
  // on the slant, the run and the rise too
  const c = at(4000, 3000);
  await page.mouse.click(c.x, c.y);
  await page.mouse.click(a.x, a.y);
  await expect(read).toContainText("×");
  await near([3606, 3000, 2000]);
  // Escape clears it; the pieces are not picked while measuring
  await page.keyboard.press("Escape");
  await expect(svg.locator(".plan-measure")).toHaveCount(0);
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // in 3D the tool is put down
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Measure" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("3");
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // and from 3D, Measure brings the plan up
  await page.getByRole("button", { name: "Measure" }).click();
  await expect(zoom).toBeVisible();
});

test("Eva's extras: who answers, Brainstorm, a pinned answer, Refine, follow-ups, Insights, Stop", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const agent = page.locator(".agent");
  const box = page.getByRole("textbox", { name: "Message Eva" });
  const evaSaid = agent.locator(
    ".agent-bubble[data-who='eva']:not(.agent-thinking)",
  );
  // which Eva: the chip names her and offers the four
  const who = page.getByRole("button", { name: /^Eva; choose Eva/ });
  await who.click();
  const choice = page.getByRole("radiogroup", { name: "Choose Eva" });
  await expect(choice.getByRole("radio")).toHaveCount(4);
  await choice.getByRole("radio", { name: /Eva · Plan/ }).click();
  await expect(
    page.getByRole("button", { name: /^Eva · Plan; choose Eva/ }),
  ).toBeVisible();
  await expect(agent.locator(".agent-who")).toContainText("Layout, flow & fit");
  // a plain answer ends in her lean
  await box.fill("hello");
  await box.press("Enter");
  await expect(evaSaid).toHaveCount(1);
  await expect(
    agent.getByRole("group", { name: "Next" }).getByRole("button", {
      name: "Lay the room out",
    }),
  ).toBeVisible();
  // Brainstorm for me: three directions, each a chip to go with
  await agent.getByRole("button", { name: "Brainstorm for me" }).click();
  await expect(evaSaid).toHaveCount(2);
  await expect(evaSaid.last()).toContainText("Three directions");
  await expect(
    agent
      .getByRole("group", { name: "Next" })
      .last()
      .getByRole("button", {
        name: /^Go with /,
      }),
  ).toHaveCount(3);
  // pinned: above the thread, and back out
  await agent.getByRole("button", { name: "Pin to project" }).last().click();
  const pinned = agent.getByRole("list", { name: "Pinned" });
  await expect(pinned.locator("li")).toHaveCount(1);
  await expect(pinned).toContainText("Three directions");
  await pinned.getByRole("button", { name: "Unpin" }).click();
  await expect(pinned).toHaveCount(0);
  // Refine, only on the latest answer: Shorter makes it so
  await expect(agent.getByRole("button", { name: "Refine reply" })).toHaveCount(
    1,
  );
  const long = (await evaSaid.last().textContent())!;
  await agent.getByRole("button", { name: "Refine reply" }).click();
  await agent
    .getByRole("group", { name: "Refine" })
    .getByRole("button", { name: "Shorter" })
    .click();
  await expect(evaSaid).toHaveCount(3);
  const short = (await evaSaid.last().textContent())!;
  expect(short.length).toBeLessThan(long.length);
  expect(long.startsWith(short)).toBe(true);
  // follow-ups read from the answer: a sofa brings sofa chips
  await box.fill("Tell me about the sofa");
  await box.press("Enter");
  await expect(evaSaid).toHaveCount(4);
  await expect(agent.getByRole("group", { name: "Next" }).last()).toContainText(
    /Compare two sofas|More options/,
  );
  // Insights: a kept preference goes back to Eva for review; an open one
  // is asked about
  await agent
    .getByRole("button", { name: "Refine design style with Eva" })
    .click();
  await expect(box).toHaveValue(
    /^Review my style direction \(Japandi, Minimalist\)/,
  );
  await agent
    .getByRole("button", { name: "Ask Eva about budget range" })
    .click();
  await expect(box).toHaveValue(/^Help me set a realistic budget/);
  await box.fill("");
  // Stop: a slow model is cut off and nothing arrives
  await page.route("**/api/chat", async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.fulfill({
      json: {
        reply: {
          text: "Late.",
          ask: "none",
          proposals: [],
          picks: [],
          chips: [],
        },
        model: "x",
      },
    });
  });
  await box.fill("one more thing");
  await box.press("Enter");
  const stop = page.getByRole("button", { name: "Stop generating" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(stop).toHaveCount(0);
  await expect(agent.locator(".agent-thinking")).toHaveCount(0);
  await page.waitForTimeout(4500);
  await expect(evaSaid).toHaveCount(4);
  // the persona travels with the project and reaches the route
  await page.unroute("**/api/chat");
  const res = await page.request.post("/api/chat", {
    data: { message: "hi", thread: [], context: { nope: true } },
  });
  expect(res.status()).toBe(400);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Eva · Plan; choose Eva/ }),
  ).toBeVisible();
});

test("a piece turns freely: the handle drags round it in steps of 15, Shift frees it, Square brings it back; turned outlines decide a clash", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  const stage = page.locator(".stage-pieces");
  const sofa = stage.locator(".stage-piece", {
    has: page.getByRole("button", { name: "Sofa", exact: true }),
  });
  await sofa.getByRole("button", { name: "Sofa", exact: true }).click();
  const handle = page.getByRole("button", { name: "Turn Sofa" });
  // a drag round the piece: from the handle's angle, 50 degrees on, read as 45
  const box = (await sofa.boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const h = (await handle.boundingBox())!;
  const hc = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  const r = Math.hypot(hc.x - c.x, hc.y - c.y);
  const a0 = Math.atan2(hc.y - c.y, hc.x - c.x);
  const at = (deg: number) => ({
    x: c.x + r * Math.cos(a0 + (deg * Math.PI) / 180),
    y: c.y + r * Math.sin(a0 + (deg * Math.PI) / 180),
  });
  await page.mouse.move(hc.x, hc.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    const p = at(5 * k);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
  await expect(sofa).toHaveAttribute("data-turn", "45");
  await expect(sofa).toHaveCSS("transform", /matrix\(0\.70/);
  // the Detail tab reads it, Square brings it to the nearest quarter
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  const deg = page.getByRole("spinbutton", { name: "Sofa turn in degrees" });
  await expect(deg).toHaveValue("45");
  await deg.fill("52");
  await deg.press("Tab");
  await expect(sofa).toHaveAttribute("data-turn", "52");
  await page.getByRole("button", { name: "Square to the walls" }).click();
  await expect(sofa).toHaveAttribute("data-turn", "90");
  await expect(
    page.getByRole("button", { name: "Square to the walls" }),
  ).toHaveCount(0);
  // R turns a quarter from there
  await page.keyboard.press("r");
  await expect(sofa).toHaveAttribute("data-turn", "180");
  // a clash is read from the turned outline, not the box round it: a vase
  // in the empty corner of a sofa on the slant does not clash
  const placeAt = async (name: string, x: string, y: string) => {
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
  // (the rest of the pieces hold their places, so the sofa goes to the
  // clear floor south of the rug, its turned box past the south wall)
  await placeAt("Sofa", "2500", "2900");
  await deg.fill("45");
  await deg.press("Tab");
  await placeAt("Ceramic vase", "2550", "2950");
  const health = page
    .locator(".agent")
    .getByRole("list", { name: "Room health" });
  await expect(health.getByText(/overlaps/)).toHaveCount(0);
  // the overlaps card shows only while something overlaps
  const card = page.getByRole("region", { name: "Overlaps" });
  await expect(card).toHaveCount(0);
  // squared, the sofa's box reaches the vase: a clash
  await placeAt("Sofa", "2500", "2900");
  await page.getByRole("button", { name: "Square to the walls" }).click();
  await expect(health).toContainText(/overlaps/);
  await expect(card).toContainText("1 overlap");
  const rows = card.locator(".clash-card-pick");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(/Sofa overlaps|overlaps Sofa/);
  // the card folds to its count, and opens again
  await card.getByRole("button", { name: "Fold the overlaps" }).click();
  await expect(rows).toHaveCount(0);
  await card.getByRole("button", { name: "Show the overlaps" }).click();
  // a row's Fix moves the other piece clear: the card goes
  await card.getByRole("button", { name: /^Fix:/ }).click();
  await expect(card).toHaveCount(0);
});

test("the room is its outline: a notch is a wall, the layouts keep out of it, the door sits on a real edge; T, U and a tapped shape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Start from" })
    .getByRole("radio", { name: "Template" })
    .click();
  const shapes = page.getByRole("radiogroup", { name: "Room shape" });
  await expect(shapes.getByRole("radio", { name: "T-shape" })).toBeVisible();
  await expect(shapes.getByRole("radio", { name: "U-shape" })).toBeVisible();
  // an L: the notch (the top right of this one) is not floor
  await shapes.getByRole("radio", { name: "L-shape", exact: true }).click();
  const outline = page.locator(".shell-stage .plan-floor");
  const corners = ((await outline.getAttribute("points")) ?? "")
    .trim()
    .split(" ");
  expect(corners).toHaveLength(6);
  const health = page
    .locator(".agent")
    .getByRole("list", { name: "Room health" });
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
  // the L's notch: x past 0.6 of the width, y under 0.45 of the depth
  await place("Work cart", "5000", "500");
  await expect(health).toContainText("Work cart stands past the wall");
  await health.getByRole("button", { name: /^Fix: Work cart/ }).click();
  await expect(health.getByText(/Work cart stands past/)).toHaveCount(0);
  // the layouts keep out of the notch too
  const layouts = page
    .locator(".agent")
    .getByRole("group", { name: "Layouts" });
  await layouts
    .locator(".agent-layout", {
      has: page.locator(".agent-layout-name", { hasText: /^Along the walls/ }),
    })
    .getByRole("button", { name: "Apply" })
    .click();
  await expect(health.getByText(/stands past the wall/)).toHaveCount(0);
  // the door on the south wall sits on the real south edge, 800 from its end
  const leaf = page.locator(".shell-stage .plan-leaf");
  const x1 = Number(await leaf.getAttribute("x1"));
  expect(x1).toBeGreaterThan(0);
  expect(x1).toBeLessThan(6500);
  // a shape tapped out of squares: the plan follows it
  await page.getByRole("tab", { name: "Room", exact: true }).click();
  await shapes.getByRole("radio", { name: "Your shape" }).click();
  const grid = page.getByRole("group", { name: "Your shape, in squares" });
  await expect(grid.getByRole("button", { pressed: true })).toHaveCount(8);
  await grid.getByRole("button", { name: "Square 4, 1" }).click();
  await expect(grid.getByRole("button", { pressed: true })).toHaveCount(9);
  // a square that would not touch the rest is refused
  await grid.getByRole("button", { name: "Square 8, 6" }).click();
  await expect(grid.getByRole("button", { pressed: true })).toHaveCount(9);
  const tapped = ((await outline.getAttribute("points")) ?? "")
    .trim()
    .split(" ");
  expect(tapped.length).toBeGreaterThanOrEqual(6);
});

test("View settings: edges, names, a floor grid, shadows and the light, kept for next time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const stage = page.locator(".shell-stage .stage-3d");
  // no names until asked: the hovered piece alone shows its own
  await expect(stage).toHaveAttribute("data-labels", "false");
  await expect(stage).toHaveAttribute("data-edges", "false");
  await expect(stage).toHaveAttribute("data-light", "day");
  await expect(stage.locator(".stage-3d-name")).toHaveCount(0);
  await page.getByRole("button", { name: "View settings" }).click();
  const menu = page.getByRole("menu", { name: "View settings" });
  await menu
    .getByRole("menuitemcheckbox", { name: "Names under the pieces" })
    .click();
  await expect(stage).toHaveAttribute("data-labels", "true");
  await expect(stage.locator(".stage-3d-name")).not.toHaveCount(0);
  await menu
    .getByRole("menuitemcheckbox", { name: "Edges on every piece" })
    .click();
  await expect(stage).toHaveAttribute("data-edges", "true");
  await menu.getByRole("menuitemcheckbox", { name: /Floor grid/ }).click();
  await expect(stage).toHaveAttribute("data-grid", "true");
  await menu.getByRole("menuitemcheckbox", { name: /^Shadows/ }).click();
  await expect(stage).toHaveAttribute("data-shadows", "false");
  await menu.getByRole("menuitemradio", { name: "Evening" }).click();
  await expect(stage).toHaveAttribute("data-light", "evening");
  // none of it shows on the plan, all of it comes back next time
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.getByRole("button", { name: "View settings" })).toHaveCount(
    0,
  );
  await page.reload();
  await page.keyboard.press("3");
  await expect(stage).toHaveAttribute("data-light", "evening");
  await expect(stage).toHaveAttribute("data-grid", "true");
  await expect(stage).toHaveAttribute("data-labels", "true");
});

test("the tour: stops on the plan, Play walks the camera through them, Stop and Escape end it, a round when there are none", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  // the keys listen once the studio has arrived on the client
  await expect(page.locator("html")).toHaveAttribute("data-arrived", "true");
  const tourTool = page.getByRole("button", { name: "Tour" });
  await page.keyboard.press("t");
  const svg = page.locator(".shell-stage .plan-svg");
  await expect(svg).toBeVisible();
  await expect(tourTool).toHaveAttribute("aria-pressed", "true");
  const strip = page.getByRole("group", { name: "Tour" });
  await expect(strip).toContainText("No stops yet");
  const box = (await svg.boundingBox())!;
  const vw = 6500 + 2 * 1100;
  const vh = 4000 + 2 * 1100;
  const at = (x: number, y: number) => ({
    x: box.x + ((x + 1100) / vw) * box.width,
    y: box.y + ((y + 1100) / vh) * box.height,
  });
  const stops = svg.locator(".plan-stop");
  for (const [x, y] of [
    [800, 800],
    [5600, 800],
    [5600, 3200],
  ]) {
    const p = at(x!, y!);
    await page.mouse.click(p.x, p.y);
  }
  await expect(stops).toHaveCount(3);
  await expect(strip).toContainText("3 stops");
  // a click past the walls sets nothing; a click on a stop takes it away
  const outside = at(-600, 2000);
  await page.mouse.click(outside.x, outside.y);
  await expect(stops).toHaveCount(3);
  await svg.getByRole("button", { name: "Take away stop 2" }).click();
  await expect(stops).toHaveCount(2);
  await expect(svg.locator(".plan-stop text").nth(1)).toHaveText("2");
  // Play: the 3D room comes up walking, the camera goes, progress climbs
  await strip.getByRole("button", { name: "Play" }).click();
  const stage = page.locator(".shell-stage .stage-3d");
  await expect(stage).toHaveAttribute("data-walk", "true");
  const run = page.getByRole("status").filter({ hasText: /^Tour/ });
  await expect(run).toBeVisible();
  const bar = run.getByRole("progressbar", { name: "Tour" });
  await page.waitForTimeout(1500);
  expect(Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await run.getByRole("button", { name: "Stop the tour" }).click();
  await expect(run).toHaveCount(0);
  await expect(stage).toHaveAttribute("data-walk", "true");
  // with the stops cleared, Play makes a round of the room; Escape ends it
  await page.keyboard.press("t");
  await strip.getByRole("button", { name: "Clear" }).click();
  await expect(stops).toHaveCount(0);
  await strip.getByRole("button", { name: "Play" }).click();
  await expect(run).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(run).toHaveCount(0);
});

/** the Account dialog from the gear: an account made, or signed into */
const PASSWORD = "a-long-enough-one";
const account = async (
  page: Page,
  email: string,
  mode: "create" | "in",
  password = PASSWORD,
) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: "Sign in" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  if (mode === "create") {
    await dialog.getByRole("tab", { name: "Create account" }).click();
    await dialog.getByLabel("Name").fill("Mei Tan");
  }
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog
    .getByRole("button", {
      name: mode === "create" ? "Create account" : "Sign in",
    })
    .click();
  return dialog;
};

test("the site opens on the home page: the way in, and a sign-in goes straight into the studio", async ({
  page,
}) => {
  // an account made, left and entered again: a long way for one test
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  // the old address still arrives
  await page.goto("/account?from=rounded");
  await expect(page).toHaveURL(/\/\?from=rounded$/);
  const rail = page.getByRole("complementary", {
    name: "Account",
    exact: true,
  });
  await expect(rail.getByRole("link", { name: /^Studio/ })).toHaveAttribute(
    "href",
    "/rounded",
  );
  // signed out, the stage is the way in; the studio is a link away
  await expect(page.getByText("Sign in to keep your projects")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Look around without an account/ }),
  ).toHaveAttribute("href", "/rounded");
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Make an account." }),
  ).toBeVisible();
  const email = `home-${Date.now()}@example.com`;
  await page.getByLabel("Name").fill("Mei Tan");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // in: straight into the studio, signed in
  await expect(page).toHaveURL(/\/rounded$/, { timeout: 20_000 });
  const bar = page.locator(".user-bar");
  await expect(bar).toContainText("Mei Tan");
  // signed in, the home page passes straight on to the studio
  await page.goto("/");
  await expect(page).toHaveURL(/\/rounded$/);
  // the gear's Account: the email, Sign out; then the way in again
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: "Account" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  await expect(dialog).toContainText(email);
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(bar).toContainText("Guest");
  await page.goto("/");
  await expect(page.getByText("Sign in to keep your projects")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/rounded$/);
  await expect(bar).toContainText("Mei Tan");
});

test("the site's edges: the privacy page, the gear's Feedback, the headers, robots and the sitemap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const res = await page.goto("/privacy");
  expect(res!.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res!.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(res!.headers()["permissions-policy"]).toContain("microphone=(self)");
  await expect(
    page.getByRole("heading", { name: "What the studio keeps." }),
  ).toBeVisible();
  // the page is longer than the screen: its stage scrolls to the end
  const terms = page.getByRole("heading", { name: "Terms" });
  await terms.scrollIntoViewIfNeeded();
  expect(
    await terms.evaluate(
      (el) => el.getBoundingClientRect().bottom <= window.innerHeight,
    ),
  ).toBe(true);
  await expect(page.getByText("hello@furnish-es.com")).toBeVisible();
  // the rail: the way in and the studio a link away, this page current
  const rail = page.getByRole("complementary", { name: "Account" });
  await expect(rail.getByRole("link", { name: /^Account/ })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(rail.locator('[aria-current="page"]')).toContainText(
    "Privacy & terms",
  );
  // the home rail links here
  await page.goto("/");
  await page
    .getByRole("complementary", { name: "Account" })
    .getByRole("link", { name: /^Privacy/ })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  // the gear's Feedback writes to the site
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("menu").getByRole("menuitem", { name: "Feedback" }),
  ).toHaveAttribute("href", /^mailto:hello@furnish-es\.com\?subject=/);
  // crawlers: the pages, not the API
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /api/");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("https://furnish-es.com/privacy");
});

test("an account: created with an email and a password, signed out, signed in again; a wrong password is said", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const bar = page.locator(".user-bar");
  await expect(bar).toContainText("Guest");
  const gear = page.getByRole("button", { name: "Settings", exact: true });
  const menu = page.getByRole("menu");
  const email = `studio-${Date.now()}@example.com`;
  const dialog = await account(page, email, "create");
  // the first call compiles the route and migrates the database
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect(bar).toContainText("Mei Tan");
  await expect(bar).toContainText(email);
  // signed out, a guest again
  await gear.click();
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(bar).toContainText("Guest");
  // back in: a wrong password is said, the right one lets in
  await account(page, email, "in", "not-the-right-one");
  await expect(dialog.getByRole("alert")).toContainText(/password|invalid/i);
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bar).toContainText("Mei Tan");
});

test("signed in, the projects follow the account to another browser; the account page lists them and opens one; deleting the account takes the mirror", async ({
  browser,
}) => {
  const seed = (ctx: BrowserContext) =>
    ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: GUIDE_STORAGE_KEY,
      value: JSON.stringify({ intro: true }),
    });
  const email = `two-${Date.now()}@example.com`;
  // the first browser: an account, a second project with a name
  const ctxA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await seed(ctxA);
  const a = await ctxA.newPage();
  await a.goto("/rounded");
  const dialogA = await account(a, email, "create");
  await expect(dialogA).toHaveCount(0, { timeout: 20_000 });
  await a.getByRole("button", { name: /^Project, / }).click();
  await a.getByRole("menuitem", { name: "New project" }).click();
  await a.getByRole("button", { name: /^Project, / }).click();
  await a.getByRole("menuitem", { name: "Rename" }).click();
  const input = a.getByRole("textbox", { name: "Project name" });
  await input.fill("Study corner");
  await input.press("Enter");
  // the account takes it a moment later
  await expect
    .poll(
      async () => {
        const r = await a.request.get("/api/sync");
        const j = (await r.json()) as {
          data: { projects?: { projects: { name: string }[] } };
        };
        return j.data.projects?.projects.map((p) => p.name) ?? [];
      },
      { timeout: 15_000 },
    )
    .toContain("Study corner");
  // the second browser, signed into the same account: the project is there
  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await seed(ctxB);
  const b = await ctxB.newPage();
  await b.goto("/rounded");
  const dialogB = await account(b, email, "in");
  await expect(dialogB).toHaveCount(0);
  await b.getByRole("button", { name: /^Project, / }).click();
  await expect(
    b.getByRole("menuitemradio", { name: "Study corner" }),
  ).toBeVisible({ timeout: 15_000 });
  await b.keyboard.press("Escape");
  // the gear's Account: the mirror, the name kept; the account can end,
  // and its mirror with it
  await b.getByRole("button", { name: "Settings", exact: true }).click();
  await b.getByRole("menu").getByRole("menuitem", { name: "Account" }).click();
  const dialog = b.getByRole("dialog", { name: "Account" });
  await expect(dialog).toContainText(email);
  await expect(dialog.getByText(/Last saved to your account/)).toBeVisible({
    timeout: 15_000,
  });
  const name = dialog.getByRole("textbox", { name: "Name" });
  await name.fill("Mei Tan Lim");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog.getByRole("status")).toContainText("Saved");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await dialog.getByRole("button", { name: "Delete for good" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(b.locator(".user-bar")).toContainText("Guest");
  expect((await a.request.get("/api/sync")).status()).toBe(401);
  await ctxA.close();
  await ctxB.close();
});

test("a room shared by link: read-only for anyone, taken into a studio as a project, listed and taken down on the account page", async ({
  browser,
}) => {
  const seed = (ctx: BrowserContext) =>
    ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: GUIDE_STORAGE_KEY,
      value: JSON.stringify({ intro: true }),
    });
  const ctxA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await seed(ctxA);
  const a = await ctxA.newPage();
  await a.goto("/rounded");
  // signed out, Share asks for an account
  const exportBtn = a.getByRole("button", { name: "Export", exact: true });
  await exportBtn.click();
  await a.getByRole("menuitem", { name: /^Share a link/ }).click();
  const account = a.getByRole("dialog", { name: "Account" });
  await expect(account).toBeVisible();
  await account.getByRole("tab", { name: "Create account" }).click();
  const email = `share-${Date.now()}@example.com`;
  await account.getByLabel("Name").fill("Mei Tan");
  await account.getByLabel("Email").fill(email);
  await account.getByLabel("Password").fill(PASSWORD);
  await account.getByRole("button", { name: "Create account" }).click();
  await expect(account).toHaveCount(0, { timeout: 20_000 });
  // signed in, the share goes on by itself and a link comes
  const share = a.getByRole("dialog", { name: "Share the room" });
  await expect(share).toBeVisible();
  const url = await share.getByRole("textbox", { name: "Link" }).inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{8}$/);
  await share.getByRole("button", { name: "Close" }).click();
  // anyone: the room, read-only, with its pieces and their total
  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await seed(ctxB);
  const b = await ctxB.newPage();
  await b.goto(url);
  await expect(
    b.getByRole("heading", { name: "First project", exact: true }),
  ).toBeVisible();
  await expect(b.locator(".stage-3d canvas")).toHaveCount(1);
  const inRoom = b.getByRole("list").last();
  await expect(inRoom).toContainText("Bookwall");
  await expect(inRoom).toContainText("5 pieces");
  await expect(inRoom).toContainText("S$1,540");
  // into a studio of their own, as a new project
  await b.getByRole("button", { name: "Open in my studio" }).click();
  await expect(b.locator(".shell-project-name")).toHaveText(
    "First project (shared)",
  );
  await b.getByRole("button", { name: /^Project, / }).click();
  await expect(b.getByRole("menuitemradio")).toHaveCount(2);
  // the gear's Account lists it under Shared rooms; taking it down ends
  // the link
  await a.getByRole("button", { name: "Settings", exact: true }).click();
  await a.getByRole("menu").getByRole("menuitem", { name: "Account" }).click();
  const dialogA = a.getByRole("dialog", { name: "Account" });
  await expect(dialogA.getByText(/^shared /)).toBeVisible();
  await dialogA
    .getByRole("button", { name: "Stop sharing First project" })
    .click();
  await b.goto(url);
  await expect(b.getByText("This room is no longer shared")).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("a piece may stand past the walls; near a wall the magnet draws it flush, inside or out, until Settings turns it off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await page
    .locator(".plan")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const sheet = (await page.locator(".plan-pieces").boundingBox())!;
  const ppm = sheet.width / 6500; // px per mm, the room's own box
  const name = top.filter((a) => a.kind === "piece")[0]!.name;
  const body = page.locator(".stage-pieces").getByRole("button", {
    name,
    exact: true,
  });
  const dragTo = async (leftPx: number) => {
    const b = (await body.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 30, { steps: 4 });
    await page.mouse.move(leftPx + b.width / 2, cy + 30, { steps: 8 });
    await page.mouse.up();
    return (await body.boundingBox())!;
  };
  // left edge let go 100 mm from the west wall: it goes flush to it
  let b = await dragTo(sheet.x + 100 * ppm);
  expect(Math.abs(b.x - sheet.x)).toBeLessThan(2);
  // let go outside, the right edge 400 mm past the wall: it stands
  // outside, against the wall band's far face (300 mm)
  b = await dragTo(sheet.x - 400 * ppm - b.width);
  expect(Math.abs(b.x + b.width - (sheet.x - 300 * ppm))).toBeLessThan(2);
  // the rules read it as past the wall
  await expect(page.getByRole("list", { name: "Room health" })).toContainText(
    `${name} stands past the wall`,
  );
  // the magnet off: the piece stays where it is let go, on the grid
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: "Settings" })
    .click();
  await page.getByRole("radio", { name: "Off" }).click();
  await page.keyboard.press("Escape");
  b = await dragTo(sheet.x + 100 * ppm);
  expect(Math.abs(b.x - (sheet.x + 100 * ppm))).toBeLessThan(2);
  expect(Math.abs(b.x - sheet.x)).toBeGreaterThan(4);
});
