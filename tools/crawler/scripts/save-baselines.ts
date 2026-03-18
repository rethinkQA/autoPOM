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

const APPS = [
  { name: "vanilla",  port: 3001 },
  { name: "react",    port: 3002 },
  { name: "vue",      port: 3003 },
  { name: "angular",  port: 3004 },
  { name: "svelte",   port: 3005 },
  { name: "nextjs",   port: 3006 },
  { name: "lit",      port: 3007 },
] as const;

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
      await page.goto(url, { timeout: 10_000, waitUntil: "domcontentloaded" });
      const manifest = await crawlPage(page);
      await page.close();

      await fs.writeFile(outFile, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`✓ ${app.name} → ${outFile} (${manifest.groups.length} groups)`);
      saved++;
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
