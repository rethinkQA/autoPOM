import { defineConfig } from "@playwright/test";
import { APP_DEFINITIONS } from "@playwright-elements/shared/apps";

/* ──────────────────────────────────────────────────────────
 * App definitions — imported from shared/apps.ts so that
 * adding/removing an app only requires changing one file.
 * ────────────────────────────────────────────────────────── */
const apps = APP_DEFINITIONS;

/* ──────────────────────────────────────────────────────────
 * Cross-browser support (opt-in).
 *
 * By default only Chromium projects are included. To also run
 * Firefox and/or WebKit:
 *
 *   BROWSERS=firefox,webkit npx playwright test
 *   npx playwright test --project=vanilla-firefox
 *   npx playwright test --project=vanilla-webkit
 *
 * Install the engines first:
 *   npx playwright install firefox webkit
 * ────────────────────────────────────────────────────────── */
const extraBrowsers = (process.env.BROWSERS ?? "").toLowerCase();
const includeFirefox = extraBrowsers.includes("firefox");
const includeWebkit  = extraBrowsers.includes("webkit");

export default defineConfig({
  testDir: "./tests",
  /* Exclude unit tests — they have their own playwright.unit.config.ts */
  testIgnore: ["**/unit/**"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  /* One web server per app — Playwright starts only the servers needed
     by the projects selected via --project.
     In CI, prefer launching servers externally via `npm run start:all`
     (concurrent) to avoid sequential 30 s startup per server.
     reuseExistingServer is true locally (reuse running dev servers)
     and in CI (so externally-launched servers are reused). */
  webServer: apps.map((app) => ({
    command: `npm start --prefix ../apps/${app.prefix}`,
    url: `http://localhost:${app.port}`,
    reuseExistingServer: true,
    timeout: process.env.CI ? 60_000 : 30_000,
    stdout: process.env.CI ? "pipe" : "ignore",
  })),

  /* Default projects run Chromium for each app.
   * Run a specific app:   npx playwright test --project=react
   * Run multiple apps:    npx playwright test --project=vanilla --project=react
   *
   * Cross-browser (opt-in):
   *   BROWSERS=firefox,webkit npx playwright test
   *   npx playwright test --project=vanilla-firefox
   */
  projects: [
    ...apps.map((app) => ({
      name: app.name,
      use: {
        browserName: "chromium" as const,
        baseURL: `http://localhost:${app.port}`,
      },
    })),

    /* ── Firefox projects (opt-in via BROWSERS env or --project) ── */
    ...(includeFirefox
      ? apps.map((app) => ({
          name: `${app.name}-firefox`,
          use: {
            browserName: "firefox" as const,
            baseURL: `http://localhost:${app.port}`,
          },
        }))
      : []),

    /* ── WebKit projects (opt-in via BROWSERS env or --project) ── */
    ...(includeWebkit
      ? apps.map((app) => ({
          name: `${app.name}-webkit`,
          use: {
            browserName: "webkit" as const,
            baseURL: `http://localhost:${app.port}`,
          },
        }))
      : []),
  ],
});
