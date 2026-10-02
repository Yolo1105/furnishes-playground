import { expect, test } from "@playwright/test";

/** The background is the studio palette: cream→peach gradient + blobs. */
test("background paints the playground palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".bg-fluid .bg-blob")).toHaveCount(3);
  const image = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  );
  expect(image).toContain("linear-gradient");
  expect(image).toContain("rgb(255, 244, 227)");
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
    expect(radius).toBe(corners === "rounded" ? "18px" : "0px");
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
  const main = (await page.locator(".shell-main").boundingBox())!;
  const top = (await page.locator(".main-top").boundingBox())!;
  const shelf = (await page.locator(".main-shelf").boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(main.y);
  expect(top.height).toBeLessThan(shelf.height);
  expect(shelf.y + shelf.height).toBeLessThanOrEqual(main.y + main.height + 1);
  const scroll = page.locator(".main-shelf-scroll");
  const overflow = await scroll.evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  expect(overflow).toBe(true);
  await scroll.evaluate((el) => el.scrollBy({ left: 300 }));
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(
    page.locator(".shelf-card").first().locator(".shelf-card-name"),
  ).toHaveText("Bookwall");
  await expect(
    page.locator(".shelf-card").first().locator(".shelf-card-price"),
  ).toHaveText("S$ 540");
});

test("rails collapse into the toolbar and come back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shell = page.locator(".shell");
  const main = page.locator(".shell-main");
  const wide = (await main.boundingBox())!.width;

  await expect(page.locator(".shell-project-name")).toHaveText("Project 0");
  await page.getByRole("button", { name: /Furnishes/ }).click();
  await page.getByRole("menuitemradio", { name: "Project 2" }).click();
  await expect(page.locator(".shell-project-name")).toHaveText("Project 2");

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

  await page.getByRole("button", { name: "Collapse Eva panel" }).click();
  await expect(shell).toHaveAttribute("data-right", "collapsed");
  const back = page.getByRole("button", { name: "Show Eva panel" });
  const bb = (await back.boundingBox())!;
  expect(bb.x).toBeGreaterThan(bar.x + bar.width / 2);
  await back.click();
  await expect(shell).toHaveAttribute("data-right", "open");

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
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
});

test("the outliner searches, filters and marks the pieces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const tree = page.getByRole("tree", { name: "Assets" });
  await expect(tree.getByRole("treeitem")).toHaveCount(24);
  // a Furnishes piece carries the mark and a price; a room item does not
  const bookwall = tree.locator(".assets-row", { hasText: "Bookwall" }).first();
  await expect(
    bookwall.locator(".assets-mark[data-kind='piece']"),
  ).toBeVisible();
  await expect(bookwall.locator(".assets-price")).toHaveText("S$ 540");
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
  await expect(tree.getByRole("treeitem")).toHaveCount(3);
  await page.getByRole("searchbox", { name: "Search assets" }).fill("");
  // filter: only the pieces
  await page.getByRole("button", { name: "Filter assets" }).click();
  await page.getByRole("button", { name: "Furnishes pieces" }).click();
  await page.keyboard.press("Escape");
  await expect(tree.locator(".assets-row[data-kind='decor']")).toHaveCount(0);
  await expect(
    tree.locator(".assets-row[data-kind='piece']").first(),
  ).toBeVisible();
  await expect(page.locator(".assets-count")).toHaveText("5 pieces · S$ 1,540");
});

test("the shelf's tab counts the pieces and folds the cards away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/rounded");
  const shelf = page.locator(".main-shelf");
  await expect(shelf.locator(".main-shelf-tab")).toContainText("5 pieces");
  await expect(shelf.locator(".main-shelf-tab")).toContainText("S$ 1,540");
  await expect(shelf.locator(".main-shelf-tab")).toContainText(
    "+ 11 room items",
  );
  const tall = (await shelf.boundingBox())!.height;
  await page.getByRole("button", { name: "Hide pieces" }).click();
  await expect(shelf).toHaveAttribute("data-collapsed", "true");
  await expect
    .poll(async () => (await shelf.boundingBox())!.height)
    .toBeLessThan(tall / 2);
  await expect(shelf.locator(".main-shelf-tab")).toBeVisible();
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
  await page.getByRole("button", { name: "Show 2D plan in main" }).click();
  await expect(page.locator(".shell-main-hint")).toHaveAttribute(
    "data-view",
    "2d",
  );
  await expect(view.locator(".view-stub")).toHaveAttribute("data-view", "3d");
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
  await expect(page.locator(".assets-count")).toHaveText("12 in the catalogue");
  await expect(page.locator(".product")).toHaveCount(12);
  await page.getByRole("searchbox", { name: "Search products" }).fill("coat");
  await expect(page.locator(".product")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Add Coat stand to the room" })
    .click();
  await page.getByRole("tab", { name: "Assets" }).click();
  await expect(page.locator(".assets-count")).toHaveText("6 pieces · S$ 1,750");
  await expect(page.locator(".main-shelf-tab")).toContainText("6 pieces");
  await page.getByRole("searchbox", { name: "Search assets" }).fill("coat");
  await expect(
    tree.locator(".assets-row", { hasText: "Coat stand" }),
  ).toBeVisible();
});
