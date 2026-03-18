/**
 * Integration tests — manifest diff operations.
 */

import { test, expect } from "@playwright/test";
import { crawlPage, diffPage } from "../src/crawler.js";
import type { CrawlerManifest, ManifestGroup } from "../src/types.js";

test.describe("Crawler — Diff", () => {
  test("diff reports no changes when page unchanged", async ({ page }) => {
    await page.goto("/");

    const manifest = await crawlPage(page);
    const diff = await diffPage(page, manifest);

    expect(diff.unchanged).toBe(true);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  test("diff detects removed groups", async ({ page }) => {
    await page.goto("/");

    const manifest = await crawlPage(page);

    // Add a fake group to the manifest that won't be in the DOM
    const fakeGroup: ManifestGroup = {
      label: "Ghost Section",
      selector: "#ghost-section",
      groupType: "section",
      wrapperType: "group",
      discoveredIn: "pass-1",
      visibility: "static",
      lastSeen: new Date().toISOString(),
    };

    const augmented: CrawlerManifest = {
      ...manifest,
      groups: [...manifest.groups, fakeGroup],
    };

    const diff = await diffPage(page, augmented);

    expect(diff.unchanged).toBe(false);
    expect(diff.removed.length).toBeGreaterThanOrEqual(1);
    expect(diff.removed.some((g) => g.selector === "#ghost-section")).toBe(true);
  });
});
