#!/usr/bin/env node
/**
 * Validates that each app's package.json dependencies include the
 * component libraries documented in REQUIREMENTS §6.7.
 *
 * Exit 0 if all match, exit 1 if any expected dependency is missing.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Expected key dependencies per app, derived from REQUIREMENTS §6.7.
 * Each entry maps an app directory name to an array of npm packages
 * that MUST appear in its dependencies or devDependencies.
 */
const EXPECTED = {
  "react-app": ["@mui/material", "react-datepicker"],
  "vue-app": ["vuetify", "@vuepic/vue-datepicker"],
  "angular-app": ["@angular/material"],
  "svelte-app": ["bits-ui", "flatpickr"],
  "nextjs-app": ["@mui/material", "react-datepicker"],
  "lit-app": ["@shoelace-style/shoelace"],
  // vanilla-html has no component library dependencies
};

let failures = 0;

for (const [app, packages] of Object.entries(EXPECTED)) {
  const pkgPath = join(ROOT, "apps", app, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    console.error(`❌ Cannot read ${pkgPath}`);
    failures++;
    continue;
  }

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  for (const dep of packages) {
    if (!allDeps[dep]) {
      console.error(`❌ ${app}: missing expected dependency "${dep}"`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} component matrix violation(s) found. See REQUIREMENTS §6.7.`
  );
  process.exit(1);
} else {
  console.log("✅ Component matrix validated — all expected dependencies present.");
}
