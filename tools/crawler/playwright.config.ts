import { defineConfig } from "@playwright/test";

/**
 * Playwright config for crawler integration tests.
 *
 * Reuses the same 7 fixture apps from the framework test suite.
 * Each app is started on its designated port.
 */
const apps = [
  { name: "vanilla",  port: 3001, prefix: "vanilla-html" },
  { name: "react",    port: 3002, prefix: "react-app" },
  { name: "vue",      port: 3003, prefix: "vue-app" },
  { name: "angular",  port: 3004, prefix: "angular-app" },
  { name: "svelte",   port: 3005, prefix: "svelte-app" },
  { name: "nextjs",   port: 3006, prefix: "nextjs-app" },
  { name: "lit",      port: 3007, prefix: "lit-app" },
] as const;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  webServer: apps.map((app) => ({
    command: `npm start --prefix ../../apps/${app.prefix}`,
    url: `http://localhost:${app.port}`,
    reuseExistingServer: true,
    timeout: 30_000,
  })),

  projects: apps.map((app) => ({
    name: app.name,
    use: {
      browserName: "chromium" as const,
      baseURL: `http://localhost:${app.port}`,
    },
  })),
});
