import path from "node:path";
import { defineConfig } from "vitest/config";

/** the unit tests beside the code (src/**\/*.test.ts): Stripe's signing,
    an order's pricing, the guard, the letters, Eva's rules and the room
    layouts; the studio itself is covered end to end by Playwright (e2e/) */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
