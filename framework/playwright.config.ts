import { defineConfig } from "@playwright/test";

/* ──────────────────────────────────────────────────────────
 * App definitions — each becomes a Playwright project with
 * its own baseURL and webServer entry.
 * ────────────────────────────────────────────────────────── */
const apps = [
  { name: "vanilla",  port: 3001, prefix: "vanilla-html" },
  { name: "react",    port: 3002, prefix: "react-app" },
  { name: "vue",      port: 3003, prefix: "vue-app" },
  { name: "angular",  port: 3004, prefix: "angular-app" },
  { name: "svelte",   port: 3005, prefix: "svelte-app" },
  { name: "nextjs",   port: 3006, prefix: "nextjs-app" },
  { name: "lit",      port: 3007, prefix: "lit-app" },
] as const;

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
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  /* One web server per app — Playwright starts only the servers needed
     by the projects selected via --project. */
  webServer: apps.map((app) => ({
    command: `npm start --prefix ../apps/${app.prefix}`,
    url: `http://localhost:${app.port}`,
    reuseExistingServer: true,
    timeout: 30_000,
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
