import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DEFINITIONS } from "@playwright-elements/shared/apps";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsDir = resolve(__dirname, "../../apps");

/**
 * Playwright config for crawler integration tests.
 *
 * Reuses the same 7 fixture apps from the framework test suite.
 * Each app is started on its designated port.
 */
const apps = APP_DEFINITIONS;

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/unit/**"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: apps.map((app) => ({
    command: `npm start --prefix ${resolve(appsDir, app.prefix)}`,
    url: `http://localhost:${app.port}`,
    reuseExistingServer: true,
    timeout: process.env.CI ? 120_000 : 60_000,
  })),

  projects: apps.map((app) => ({
    name: app.name,
    use: {
      browserName: "chromium" as const,
      baseURL: `http://localhost:${app.port}`,
    },
  })),
});
