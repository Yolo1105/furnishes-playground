#!/usr/bin/env node
/**
 * First-load JavaScript per route, read from a production build
 * (`.next/app-build-manifest.json`, the app router's manifest: the
 * script files a route's page needs, with the root layout's), each file
 * gzipped here as the server would send it. Run after `next build`:
 *
 *   node scripts/first-load.mjs            # the table
 *   node scripts/first-load.mjs --check    # fails when /rounded is over budget
 *
 * The budget is the plan's (R7): 450 KB gzip for /rounded, the studio.
 * CI runs the check after the build, so a static import that drags the
 * part editor, the bench, the tracer or a kernel into the first load
 * fails there rather than in the field.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const next = path.join(root, ".next");
const manifestPath = path.join(next, "app-build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error(
    "no build: run `next build` first (missing " + manifestPath + ")",
  );
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const ROUTES = ["/rounded", "/studio", "/"];
const BUDGET_KB = 450;
const BUDGET_ROUTE = "/rounded";

const gz = new Map();
const gzipped = (file) => {
  if (!gz.has(file)) {
    const p = path.join(next, file);
    gz.set(file, existsSync(p) ? gzipSync(readFileSync(p)).length : 0);
  }
  return gz.get(file);
};
/** the files a route's first load needs: its page's and its layouts' */
const filesOf = (route) => {
  const page = `${route === "/" ? "" : route}/page`;
  const files = new Set(manifest.pages[page] ?? []);
  for (const key of Object.keys(manifest.pages))
    if (
      key.endsWith("/layout") &&
      (key === "/layout" ||
        page.startsWith(key.slice(0, -"/layout".length) + "/"))
    )
      for (const f of manifest.pages[key]) files.add(f);
  return [...files].filter((f) => f.endsWith(".js"));
};
const kb = (n) => (n / 1024).toFixed(1);
const rows = ROUTES.map((route) => {
  const files = filesOf(route);
  const total = files.reduce((t, f) => t + gzipped(f), 0);
  return { route, files: files.length, total };
});
console.log("route        files   first-load JS (gzip)");
for (const r of rows)
  console.log(
    `${r.route.padEnd(12)} ${String(r.files).padStart(5)}   ${kb(r.total).padStart(8)} KB`,
  );
// what forbidden code, if any, rides in the first load
const forbidden = /manifold|replicad|planegcs|oidn|pathtracer/i;
for (const r of rows) {
  const bad = filesOf(r.route).filter((f) => {
    const p = path.join(next, f);
    if (!existsSync(p)) return false;
    const src = readFileSync(p, "utf8");
    return (
      forbidden.test(f) ||
      /three-gpu-pathtracer|manifold\.wasm|replicad_single|planegcs\.wasm|oidn/.test(
        src,
      )
    );
  });
  if (bad.length) console.log(`${r.route}: carries ${bad.join(", ")}`);
}
if (process.argv.includes("--check")) {
  const r = rows.find((x) => x.route === BUDGET_ROUTE);
  const over = r.total > BUDGET_KB * 1024;
  console.log(
    over
      ? `FAIL: ${BUDGET_ROUTE} first-load JS ${kb(r.total)} KB gzip is over the ${BUDGET_KB} KB budget`
      : `ok: ${BUDGET_ROUTE} first-load JS ${kb(r.total)} KB gzip, budget ${BUDGET_KB} KB`,
  );
  process.exit(over ? 1 : 0);
}
