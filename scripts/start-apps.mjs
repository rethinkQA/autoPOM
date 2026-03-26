#!/usr/bin/env node

/**
 * Start all apps listed in shared/apps.ts using concurrently,
 * then run the health-check script to wait until they're ready.
 * Replaces the hardcoded concurrently command formerly in `npm run start:all`.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppDefinitions } from "./load-apps.mjs";

// Ensure we're running from the repo root (scripts rely on relative paths)
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
if (!existsSync(resolve(rootDir, "package.json")) || !existsSync(resolve(rootDir, "shared/apps.ts"))) {
  console.error("✗ Cannot locate repo root. Run this script via `npm run start:all` from the repo root.");
  process.exit(1);
}

// Generate shared.js for vanilla-html before starting
execSync("npm run generate-shared", { stdio: "inherit" });

const apps = await loadAppDefinitions();

// Validate app names/prefixes contain only safe characters
const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;
for (const a of apps) {
  if (!SAFE_NAME.test(a.name) || !SAFE_NAME.test(a.prefix)) {
    console.error(`✗ Unsafe characters in app name "${a.name}" or prefix "${a.prefix}".`);
    process.exit(1);
  }
}

const names = apps.map((a) => a.name).join(",");
const cmds = apps
  .map((a) => `"npm start --prefix apps/${a.prefix}"`)
  .join(" ");

// In CI, don't include the healthcheck in concurrently — servers are
// backgrounded and Playwright's webServer config starts its own when needed.
// Including healthcheck causes concurrently to kill servers once it exits.
if (process.env.CI) {
  execSync(
    `npx concurrently --kill-others-on-fail --names ${names} ${cmds}`,
    { stdio: "inherit" },
  );
} else {
  execSync(
    `npx concurrently --kill-others-on-fail --names ${names},healthcheck ${cmds} "node scripts/wait-for-apps.mjs"`,
    { stdio: "inherit" },
  );
}
