import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  timeout: 10_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],

  use: {
    trace: "retain-on-failure",
  },
});
