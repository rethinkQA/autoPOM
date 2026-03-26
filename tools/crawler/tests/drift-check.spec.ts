/**
 * Phase 13.2 — Drift Detection: compare live pages against saved baselines.
 *
 * This test reads saved baseline manifests from manifests/<app>.json,
 * re-crawls each app, and diffs the result. If the manifest has drifted
 * (groups added/removed/changed), the test fails.
 *
 * Baselines are generated with:
 *   npm run save-baselines
 *
 * This test runs as part of the CI pipeline alongside the 700 integration
 * tests and 67 crawler unit tests.
 */

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { crawlPage, diffPage } from "../src/crawler.js";
import { emitPageObject } from "../src/emitter.js";
import { diffPageObjects, formatEmitterDiff } from "../src/emitter-diff.js";
import type { CrawlerManifest } from "../src/types.js";

// ── Baseline manifest directory ─────────────────────────────

const MANIFESTS_DIR = resolve(import.meta.dirname, "../manifests");

/**
 * Load a baseline manifest for the current project.
 * Returns null if no baseline exists (test should skip).
 */
async function loadBaseline(projectName: string): Promise<CrawlerManifest | null> {
  const filePath = resolve(MANIFESTS_DIR, `${projectName}.json`);
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as CrawlerManifest;
}

// ── Drift detection tests ───────────────────────────────────

test.describe("Phase 13.2: Drift Detection — Manifest", () => {
  test("no manifest drift on home page", async ({ page }, testInfo) => {
    const baseline = await loadBaseline(testInfo.project.name);
    expect(baseline,
      `No baseline manifest for ${testInfo.project.name}. Run: npm run save-baselines`,
    ).not.toBeNull();

    await page.goto("/");
    const diff = await diffPage(page, baseline!);

    if (!diff.unchanged) {
      const addedLabels = diff.added.map((g) => g.label).join(", ");
      const removedLabels = diff.removed.map((g) => g.label).join(", ");
      const changedLabels = diff.changed.map((c) => c.mergeKey).join(", ");

      const report = [
        `Manifest drift detected for ${testInfo.project.name}:`,
        diff.added.length > 0 ? `  Added (${diff.added.length}): ${addedLabels}` : "",
        diff.removed.length > 0 ? `  Removed (${diff.removed.length}): ${removedLabels}` : "",
        diff.changed.length > 0 ? `  Changed (${diff.changed.length}): ${changedLabels}` : "",
        "",
        "Run `npm run save-baselines` to update baseline manifests.",
      ]
        .filter(Boolean)
        .join("\n");

      expect(diff.unchanged, report).toBe(true);
    }
  });
});

test.describe("Phase 13.2: Drift Detection — Generated Page Objects", () => {
  test("generated page object has not drifted", async ({ page }, testInfo) => {
    const baseline = await loadBaseline(testInfo.project.name);
    expect(baseline,
      `No baseline manifest for ${testInfo.project.name}. Run: npm run save-baselines`,
    ).not.toBeNull();

    await page.goto("/");
    const currentManifest = await crawlPage(page);

    // Generate page objects from both baseline and current manifests
    const baselinePageObject = emitPageObject(baseline!, {
      routeName: "home",
      generatedMarkers: false,
    });
    const currentPageObject = emitPageObject(currentManifest, {
      routeName: "home",
      generatedMarkers: false,
    });

    // Diff the generated page objects
    const diff = diffPageObjects(currentPageObject, baselinePageObject);

    if (!diff.unchanged) {
      const report = formatEmitterDiff(diff);
      expect(diff.unchanged, `Page object drift for ${testInfo.project.name}:\n${report}`).toBe(
        true,
      );
    }
  });
});
