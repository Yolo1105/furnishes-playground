#!/usr/bin/env node
/**
 * The studio's own pictures of the room, one per bookmark, for
 * tools/compare-refs.mjs to set beside the Cycles references. Run on
 * a machine with Chrome and a GPU (WebGPU), with the dev server up:
 *
 *   node tools/studio-shots.mjs --url http://localhost:3000/rounded --out shots/
 *
 * Headed Chrome by default, since headless Chromium has no WebGPU
 * adapter; --headless runs it headless (the WebGL backend then). Each
 * picture waits for the stage to say its probes, its reflection and
 * its edges have settled, as the kept pictures do.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/web/node_modules/@playwright/test");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = arg("url", "http://localhost:3000/rounded");
const out = arg("out", "shots");
const headless = process.argv.includes("--headless");
const BOOKMARKS = ["Perspective", "Front", "Back", "Left", "Right", "Top"];

const settled = async (stage) => {
  for (const [k, re] of [
    ["data-probes", /ready|off/],
    ["data-reflection", /ready|off/],
    ["data-settled", /true/],
  ]) {
    for (let i = 0; i < 600; i++) {
      const v = await stage.getAttribute(k);
      if (v && re.test(v)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
};

const main = async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless,
    channel: headless ? undefined : "chrome",
    args: headless ? [] : ["--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => {
    localStorage.setItem("furnishes.guides", JSON.stringify({ intro: true }));
    localStorage.setItem(
      "furnishes.view",
      JSON.stringify({ scene: { quality: "full" } }),
    );
  });
  await page.goto(url);
  await page.waitForSelector('html[data-arrived="true"]', { timeout: 60000 });
  const stage = page.locator(".shell-stage .stage-3d");
  console.log("backend", await stage.getAttribute("data-backend"));
  for (const name of BOOKMARKS) {
    await page.getByRole("radio", { name }).click();
    await page.waitForTimeout(1200);
    await settled(stage);
    const file = join(out, `${name.toLowerCase()}.png`);
    await stage.screenshot({ path: file });
    console.log("wrote", file);
  }
  await page.getByRole("radio", { name: "Perspective" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Walk the room" }).click();
  await settled(stage);
  await stage.screenshot({ path: join(out, "walk.png") });
  console.log("wrote", join(out, "walk.png"));
  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
