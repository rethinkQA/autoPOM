import { defineConfig } from "@playwright/test";

/**
 * Unit test config — runs tests that don't need a browser or web server.
 */
export default defineConfig({
  testDir: "./tests/unit",
  timeout: 10_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
});
