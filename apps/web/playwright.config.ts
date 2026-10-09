import { defineConfig, devices } from "@playwright/test";

/**
 * The studio is driven by a mouse, a trackpad, a finger and a pen, in
 * Chrome, Edge, Safari and Firefox. Chromium is always here: the desktop
 * project runs the studio's own suite with a mouse, the visual project
 * compares five fixed views of the room with their kept pictures, and
 * two touch projects run the touch suite on an iPad's and a phone's
 * screen with a finger (Chromium emulating both). The WebKit and Firefox engines run
 * the desktop suite too, where they are installed (`npx playwright
 * install webkit firefox`), with PW_ENGINES=1.
 */
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  // a software GPU draws the room's materials slowly, and the suite's
  // longer walks through the studio take most of a minute on one
  timeout: 60_000,
  // one development server and one software GPU: a second worker only
  // slows the first
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    {
      name: "desktop",
      testMatch: /studio\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        ...chromium,
      },
    },
    {
      // the five fixed views, compared with their kept pictures; each
      // waits for the full finish (probes, the floor's picture, the
      // shadows) on the software GPU, most of a minute by itself
      name: "visual",
      testMatch: /visual\.spec\.ts/,
      // a software renderer takes a minute or two to bake a room's
      // probes before a picture can be taken, and the evening view
      // bakes twice
      timeout: 300_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        ...chromium,
      },
    },
    {
      name: "tablet",
      testMatch: /touch\.spec\.ts/,
      use: { ...devices["iPad (gen 7)"], browserName: "chromium", ...chromium },
    },
    {
      name: "phone",
      testMatch: /touch\.spec\.ts/,
      use: { ...devices["iPhone 14"], browserName: "chromium", ...chromium },
    },
    ...(process.env.PW_ENGINES
      ? [
          {
            name: "webkit",
            testMatch: /studio\.spec\.ts/,
            use: { ...devices["Desktop Safari"] },
          },
          {
            name: "firefox",
            testMatch: /studio\.spec\.ts/,
            use: { ...devices["Desktop Firefox"] },
          },
        ]
      : []),
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
