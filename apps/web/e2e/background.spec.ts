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
      page.locator(".shell-panel-left").boundingBox(),
      page.locator(".shell-main").boundingBox(),
      page.locator(".shell-panel-right").boundingBox(),
    ]);
    expect(l && m && r).toBeTruthy();
    expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + 1);
    expect(m!.x + m!.width).toBeLessThanOrEqual(r!.x + 1);
    expect(m!.width).toBeGreaterThan(l!.width);
    expect(m!.width).toBeGreaterThan(r!.width);
    const radius = await page
      .locator(".shell-panel-left")
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(radius).toBe(corners === "rounded" ? "18px" : "0px");
  });

  test(`${path} turns the panels into drawers on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const left = page.locator(".shell-panel-left");
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
  ).toHaveText("Piece 01");
  await expect(
    page.locator(".shelf-card").first().locator(".shelf-card-price"),
  ).toHaveText("S$ 60");
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
