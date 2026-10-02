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
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page.locator(".shell")).toHaveAttribute("data-open", "left");
    await expect
      .poll(async () => (await left.boundingBox())!.x)
      .toBeGreaterThanOrEqual(0);
  });
}
