import { defineConfig, devices } from "@playwright/test";

/**
 * The studio is driven by a mouse, a trackpad, a finger and a pen, in
 * Chrome, Edge, Safari and Firefox. Chromium is always here: the desktop
 * project runs the studio's own suite with a mouse, and two touch
 * projects run the touch suite on an iPad's and a phone's screen with a
 * finger (Chromium emulating both). The WebKit and Firefox engines run
 * the desktop suite too, where they are installed (`npx playwright
 * install webkit firefox`), with PW_ENGINES=1.
 */
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    {
      name: "desktop",
      testMatch: /studio\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...chromium },
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
