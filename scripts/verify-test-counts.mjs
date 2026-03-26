#!/usr/bin/env node
/**
 * Verify and optionally update hardcoded test counts in documentation.
 *
 * Usage:
 *   node scripts/verify-test-counts.mjs            # print current counts
 *   node scripts/verify-test-counts.mjs --check     # exit 1 if docs are stale
 *   node scripts/verify-test-counts.mjs --update    # patch docs in place
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppDefinitions } from "./load-apps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load app definitions from the shared source of truth (P2-85).
const APP_DEFINITIONS = await loadAppDefinitions();
const APP_NAMES = APP_DEFINITIONS.map((a) => a.name);
const APP_COUNT = APP_NAMES.length;

// ---------------------------------------------------------------------------
// 1. Gather actual counts from Playwright
// ---------------------------------------------------------------------------

function getTestCount(cwd, extraArgs = "") {
  const args = ["playwright", "test", "--list", ...extraArgs.split(/\s+/).filter(Boolean)];
  const out = execSync(`npx ${args.map(a => `'${a}'`).join(" ")} 2>&1 | tail -1`, { cwd, encoding: "utf-8", shell: "/bin/sh" }).trim();
  const m = out.match(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/);
  if (!m) {
    console.error(`  ✗ Could not parse test count from: "${out}" (cwd: ${cwd})`);
    process.exit(1);
  }
  return { tests: Number(m[1]), files: Number(m[2]) };
}

console.log("Counting tests…\n");

const fwDir = resolve(ROOT, "framework");
const crDir = resolve(ROOT, "tools/crawler");

const fwIntegration = getTestCount(fwDir);
const fwUnit = getTestCount(fwDir, "--config=playwright.unit.config.ts");
const crIntegration = getTestCount(crDir);
const crUnit = getTestCount(crDir, "--config=playwright.unit.config.ts");

const fwTotal = fwIntegration.tests + fwUnit.tests;
const crTotal = crIntegration.tests + crUnit.tests;
const grandTotal = fwTotal + crTotal;
const perApp = Math.round(fwIntegration.tests / APP_COUNT);
const fwSpecFiles = fwIntegration.files + fwUnit.files;

const counts = {
  fwIntegration: fwIntegration.tests,
  fwIntegrationFiles: fwIntegration.files,
  fwUnit: fwUnit.tests,
  fwUnitFiles: fwUnit.files,
  fwTotal,
  fwSpecFiles,
  perApp,
  crIntegration: crIntegration.tests,
  crIntegrationFiles: crIntegration.files,
  crUnit: crUnit.tests,
  crUnitFiles: crUnit.files,
  crTotal,
  grandTotal,
};

console.log("  Framework integration : %d tests in %d files (%d per app × %d)", counts.fwIntegration, counts.fwIntegrationFiles, counts.perApp, APP_COUNT);
console.log("  Framework unit        : %d tests in %d files", counts.fwUnit, counts.fwUnitFiles);
console.log("  Framework total       : %d", counts.fwTotal);
console.log("  Crawler integration   : %d tests in %d files", counts.crIntegration, counts.crIntegrationFiles);
console.log("  Crawler unit          : %d tests in %d files", counts.crUnit, counts.crUnitFiles);
console.log("  Crawler total         : %d", counts.crTotal);
console.log("  Grand total           : %d\n", counts.grandTotal);

// ---------------------------------------------------------------------------
// 1b. Per-app test parity validation
// ---------------------------------------------------------------------------

/** Maximum allowed deviation (in tests) between any app and the per-app average.
 * P3-123: Scales with test count — at least 5, or 5% of the average, whichever is greater. */
const PARITY_THRESHOLD = Math.max(5, Math.round(perApp * 0.05));

console.log("Per-app integration test counts:");

const perAppCounts = {};
for (const app of APP_NAMES) {
  const safeApp = app.replace(/[^a-zA-Z0-9_-]/g, "");
  const cmd = `npx playwright test --list '--project=${safeApp}' 2>&1 | tail -1`;
  const out = execSync(cmd, { cwd: fwDir, encoding: "utf-8" }).trim();
  const m = out.match(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/);
  if (!m) {
    console.error(`  ✗ Could not parse test count for project "${app}": "${out}"`);
    process.exit(1);
  }
  perAppCounts[app] = Number(m[1]);
  console.log("  %-10s: %d tests", app, perAppCounts[app]);
}

const appValues = Object.values(perAppCounts);
const avgPerApp = Math.round(appValues.reduce((a, b) => a + b, 0) / appValues.length);
const parityIssues = [];

for (const [app, count] of Object.entries(perAppCounts)) {
  const diff = Math.abs(count - avgPerApp);
  if (diff > PARITY_THRESHOLD) {
    parityIssues.push({ app, count, diff, avgPerApp });
  }
}

if (parityIssues.length > 0) {
  console.log("\n  ⚠  Per-app parity issues (threshold: ±%d from average %d):", PARITY_THRESHOLD, avgPerApp);
  for (const { app, count, diff } of parityIssues) {
    const direction = count > avgPerApp ? "above" : "below";
    console.log("       %s: %d tests (%d %s average)", app, count, diff, direction);
  }
} else {
  console.log("\n  ✓  All apps within ±%d of average (%d tests per app)", PARITY_THRESHOLD, avgPerApp);
}

console.log("");

// ---------------------------------------------------------------------------
// 2. Define replacements — each entry targets one pattern in one file
// ---------------------------------------------------------------------------

/** @param {number} n */
const comma = (n) => n.toLocaleString("en-US");

const replacements = [
  // --- docs/ROADMAP.md ---
  {
    file: "docs/ROADMAP.md",
    pattern: /\*\*Current test count:\*\*.*all passing\./,
    replacement: `**Current test count:** ${comma(grandTotal)} tests (${comma(counts.fwIntegration)} framework integration + ${counts.fwUnit} unit + ${comma(counts.crIntegration)} crawler integration + ${counts.crUnit} crawler unit), all passing.`,
  },
  // --- README.md tree comment (framework tests line) ---
  {
    file: "README.md",
    pattern: /(│\s+├── tests\/\s+←\s*)\d[\d,]+ integration \+ \d[\d,]+ unit tests/,
    replacement: `$1${comma(counts.fwIntegration)} integration + ${counts.fwUnit} unit tests`,
  },
  // --- README.md bullet ---
  {
    file: "README.md",
    pattern: /- \*\*[\d,]+ tests passing\*\*.*/,
    replacement: `- **${comma(grandTotal)} tests passing** — framework: ${comma(counts.fwIntegration)} integration (${APP_COUNT} apps) + ${counts.fwUnit} unit; crawler: ${comma(counts.crIntegration)} integration (${APP_COUNT} apps) + ${counts.crUnit} unit`,
  },
  // --- docs/CONTRIBUTING.md tree comment ---
  {
    file: "docs/CONTRIBUTING.md",
    pattern: /(│\s+└── tests\/\s+←\s*)\d[\d,]+ integration \+ \d[\d,]+ unit tests/,
    replacement: `$1${comma(counts.fwIntegration)} integration + ${counts.fwUnit} unit tests`,
  },
  // --- framework/README.md "and NNNN tests." ---
  {
    file: "framework/README.md",
    pattern: /and \d[\d,]* tests\./,
    replacement: `and ${counts.fwTotal} tests.`,
  },
  // --- framework/README.md "# all N apps (NNN integration tests)" ---
  {
    file: "framework/README.md",
    pattern: /# all \d+ apps \(\d[\d,]* integration tests\)/,
    replacement: `# all ${APP_COUNT} apps (${counts.fwIntegration} integration tests)`,
  },
  // --- framework/README.md "# NNN unit tests" ---
  {
    file: "framework/README.md",
    pattern: /(playwright\.unit\.config\.ts\s+#\s*)\d[\d,]* unit tests/,
    replacement: `$1${counts.fwUnit} unit tests`,
  },
  // --- framework/README.md unit tree "(NN files, NNN tests)" ---
  {
    file: "framework/README.md",
    pattern: /(unit\/\s+)\(\d+ files, \d+ tests\)/,
    replacement: `$1(${counts.fwUnitFiles} files, ${counts.fwUnit} tests)`,
  },
  // --- framework/README.md "NNNN tests across NN spec files (NN integration × N apps + NN unit)" ---
  {
    file: "framework/README.md",
    pattern: /\d[\d,]* tests across \d+ spec files \(\d+ integration × \d+ apps \+ \d+ unit\)/,
    replacement: `${counts.fwTotal} tests across ${counts.fwSpecFiles} spec files (${counts.fwIntegrationFiles} integration × ${APP_COUNT} apps + ${counts.fwUnitFiles} unit)`,
  },
  // --- framework/README.md compatibility table total row ---
  {
    file: "framework/README.md",
    pattern: /(\| \*\*Total\*\* \| \| \*\*6 component libraries \+ vanilla baseline\*\* \| \*\*)\d[\d,]*(\*\* \| \*\*✅\*\* \|)/,
    replacement: `$1${counts.fwIntegration}$2`,
  },
  // --- framework/README.md "### Unit tests (NNN tests, NN files)" ---
  {
    file: "framework/README.md",
    pattern: /### Unit tests \(\d+ tests, \d+ files\)/,
    replacement: `### Unit tests (${counts.fwUnit} tests, ${counts.fwUnitFiles} files)`,
  },
  // --- framework/README.md "### Integration tests (NNN tests per app, NN files)" ---
  {
    file: "framework/README.md",
    pattern: /### Integration tests \(\d+ tests per app, \d+ files\)/,
    replacement: `### Integration tests (${counts.perApp} tests per app, ${counts.fwIntegrationFiles} files)`,
  },
  // --- docs/REQUIREMENTS.md §8 "NNN/NNN integration tests + NNN unit tests" ---
  {
    file: "docs/REQUIREMENTS.md",
    pattern: /\d[\d,]+\/\d[\d,]+ integration tests \+ \d[\d,]+ unit tests passing/,
    replacement: `${comma(counts.fwIntegration)}/${comma(counts.fwIntegration)} integration tests + ${counts.fwUnit} unit tests passing`,
  },
];

// ---------------------------------------------------------------------------
// 3. Check or update
// ---------------------------------------------------------------------------

const mode = process.argv[2]; // --check | --update | undefined

let staleCount = 0;
let unmatchedCount = 0;

for (const r of replacements) {
  const absPath = resolve(ROOT, r.file);
  const content = readFileSync(absPath, "utf-8");
  const match = content.match(r.pattern);

  if (!match) {
    unmatchedCount++;
    console.warn(`  ✗  Pattern not found in ${r.file} — pattern may need updating`);
    continue;
  }

  // Build the full expected string (resolve $1/$2 capture groups)
  const expected = match[0].replace(r.pattern, r.replacement);

  if (match[0] === expected) {
    console.log(`  ✓  ${r.file} — up to date`);
  } else {
    staleCount++;
    console.log(`  ✗  ${r.file} — STALE`);
    console.log(`       was: ${match[0]}`);
    console.log(`       now: ${expected}`);

    if (mode === "--update") {
      const updated = content.replace(r.pattern, r.replacement);
      writeFileSync(absPath, updated);
      console.log(`       → updated`);
    }
  }
}

console.log("");

if (staleCount === 0) {
  console.log("All test counts are up to date.");
} else if (mode === "--update") {
  console.log(`Updated ${staleCount} stale count(s).`);
} else {
  console.log(`${staleCount} stale count(s) found. Run with --update to fix, or update docs manually.`);
  if (mode === "--check") {
    process.exit(1);
  }
}

if (mode === "--check" && unmatchedCount > 0) {
  console.error(`\n${unmatchedCount} pattern(s) failed to match their target files. Patterns may need updating.`);
  process.exit(1);
}

if (mode === "--check" && parityIssues.length > 0) {
  console.error(`\n${parityIssues.length} app(s) deviate from the per-app average by more than ${PARITY_THRESHOLD} tests.`);
  process.exit(1);
}
