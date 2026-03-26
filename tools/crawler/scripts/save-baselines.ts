#!/usr/bin/env npx tsx

/**
 * Save baseline manifests for all 7 apps.
 *
 * Run with apps already started on their designated ports:
 *   npx tsx scripts/save-baselines.ts
 *
 * Or use the npm script:
 *   npm run save-baselines
 *
 * This crawls each app's home page and saves the manifest to
 * manifests/<app>.json. These baselines are used by the drift
 * detection test (drift-check.spec.ts) and CI pipeline.
 */

import { chromium } from "playwright";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { crawlPage } from "../src/crawler.js";

const __filename = fileURLToPath(import.meta.url);
 
const __dirname = path.dirname(__filename);

// Import the shared app definitions — single source of truth (P2-82).
// Use readFileSync + esbuild transform to avoid rootDir/extension constraints.
import { readFileSync } from "fs";
import { transform } from "esbuild";

const sharedAppsPath = path.resolve(__dirname, "../../../shared/apps.ts");
const tsCode = readFileSync(sharedAppsPath, "utf8");
const { code: jsCode } = await transform(tsCode, { loader: "ts", format: "esm" });
const dataUri = `data:text/javascript;base64,${Buffer.from(jsCode).toString("base64")}`;
const { APP_DEFINITIONS } = await import(dataUri);
const APPS = APP_DEFINITIONS as ReadonlyArray<{ name: string; port: number }>;

// Project root is two levels up from dist/scripts/ or one level up from scripts/
// Use process.cwd() since we always run from the crawler package root.
const MANIFESTS_DIR = path.resolve(process.cwd(), "manifests");

async function main() {
  await fs.mkdir(MANIFESTS_DIR, { recursive: true });

  const browser = await chromium.launch();

  let saved = 0;
  let failed = 0;

  for (const app of APPS) {
    const url = `http://localhost:${app.port}/`;
    const outFile = path.resolve(MANIFESTS_DIR, `${app.name}.json`);

    try {
      const page = await browser.newPage();
      try {
        await page.goto(url, { timeout: 10_000, waitUntil: "domcontentloaded" });
        const manifest = await crawlPage(page);
        await fs.writeFile(outFile, JSON.stringify(manifest, null, 2) + "\n");
        console.log(`✓ ${app.name} → ${outFile} (${manifest.groups.length} groups)`);
        saved++;
      } finally {
        // P2-305: ensure page is closed even if crawlPage() or goto() throws
        await page.close();
      }
    } catch (err) {
      console.error(`✗ ${app.name} — ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  await browser.close();

  console.log(`\nDone: ${saved} saved, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
