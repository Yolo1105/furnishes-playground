import { expect, test } from "@playwright/test";

/** The page is only the studio background: cream→peach gradient + blobs. */
test("background paints the playground palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".bg-fluid .bg-blob")).toHaveCount(3);
  const image = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  );
  expect(image).toContain("linear-gradient");
  expect(image).toContain("rgb(255, 244, 227)");
});
