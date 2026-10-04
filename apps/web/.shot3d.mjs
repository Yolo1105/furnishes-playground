import { chromium } from "@playwright/test";
const out = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [tag, floor] of [["day", null], ["walk", null]]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("furnishes.guides", JSON.stringify({ intro: true }));
    localStorage.setItem("furnishes.view", JSON.stringify({ view: "3d", scene: { shadows: "on", labels: false } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 200)));
  await page.goto("http://localhost:3000/rounded");
  await page.waitForSelector('html[data-arrived="true"]');
  await page.waitForTimeout(4000);
  if (tag === "walk") {
    await page.getByRole("button", { name: "Walk the room" }).click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: `${out}/s3-${tag}.png`, clip: { x: 276, y: 50, width: 830, height: 650 } });
  await ctx.close();
}
await b.close();
