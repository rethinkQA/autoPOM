#!/usr/bin/env node

/**
 * Install npm dependencies for every app listed in shared/apps.ts.
 * Replaces the hardcoded for-loop formerly in `npm run install:all`.
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppDefinitions } from "./load-apps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const apps = await loadAppDefinitions();

for (const app of apps) {
  const dir = resolve(rootDir, "apps", app.prefix);
  const cmd = process.env.CI ? "npm ci" : "npm install";
  console.log(`Installing ${app.prefix}... (${cmd})`);
  try {
    execSync(cmd, { cwd: dir, stdio: "inherit", timeout: 300_000 });
  } catch (err) {
    console.error(`\n✗ ${cmd} failed for app "${app.prefix}" (dir: ${dir})`);
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

console.log(`\n✅ All ${apps.length} apps installed.`);
