/**
 * Cross-app validation — crawl all 7 apps and assert they
 * discover the same logical groups despite different DOM
 * implementations.
 *
 * The GeneralStore UI contract (§6) specifies the same structure
 * across all frameworks. The crawler should find equivalent groups
 * in each app: header, nav, footer, fieldsets, table, dialog, toast.
 *
 * **Framework differences documented here:**
 * - Lit/Shoelace: all content is in Shadow DOM, requiring deep traversal
 * - React/Vue/Angular/Svelte/Next.js: dialogs are portaled (need pass 2)
 * - Toasts are conditionally rendered in most non-vanilla apps
 */

import { test, expect } from "@playwright/test";
import { crawlPage } from "../src/crawler.js";
import { recordPage } from "../src/record-api.js";
import type { CrawlerManifest, WrapperType } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────

function countByWrapper(manifest: CrawlerManifest, type: WrapperType): number {
  return manifest.groups.filter((g) => g.wrapperType === type).length;
}

function hasGroupType(manifest: CrawlerManifest, type: string): boolean {
  return manifest.groups.some((g) => g.groupType === type);
}

function hasLabel(manifest: CrawlerManifest, pattern: RegExp): boolean {
  return manifest.groups.some((g) => pattern.test(g.label));
}

// ── Structural assertions shared across all apps ────────────

test.describe("Cross-app structure validation", () => {
  test("discovers at least 5 groups", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(manifest.groups.length).toBeGreaterThanOrEqual(5);
  });

  test("has a header", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(hasGroupType(manifest, "header")).toBe(true);
  });

  test("has navigation", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(hasGroupType(manifest, "nav")).toBe(true);
  });

  test("has a footer", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(hasGroupType(manifest, "footer")).toBe(true);
  });

  test("has at least one table", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(countByWrapper(manifest, "table")).toBeGreaterThanOrEqual(1);
  });

  test("has at least one dialog (always-in-DOM apps)", async ({ page }, testInfo) => {
    // [P1-13] Non-vanilla apps use portaled dialogs — recorder triggers them.
    const project = testInfo.project.name;
    await page.goto("/");

    if (project === "vanilla") {
      const manifest = await crawlPage(page);
      expect(countByWrapper(manifest, "dialog")).toBeGreaterThanOrEqual(1);
    } else {
      const base = await crawlPage(page);
      const manifest = await recordPage(page, async (p) => {
        await p.locator("table >> text=Wireless Mouse").first().click();
        await p.waitForTimeout(500);
      }, { existing: base });
      expect(countByWrapper(manifest, "dialog")).toBeGreaterThanOrEqual(1);
    }
  });

  test("has at least one toast/live-region", async ({ page }, testInfo) => {
    // [P1-13] Non-vanilla apps conditionally render toasts — recorder triggers them.
    const project = testInfo.project.name;
    await page.goto("/");

    if (project === "vanilla") {
      const manifest = await crawlPage(page);
      expect(countByWrapper(manifest, "toast")).toBeGreaterThanOrEqual(1);
    } else {
      const base = await crawlPage(page);
      const manifest = await recordPage(page, async (p) => {
        // Click "Add to Cart" to trigger toast
        await p.locator("button >> text=Add to Cart").first().click();
        await p.waitForTimeout(500);
      }, { existing: base });
      expect(countByWrapper(manifest, "toast")).toBeGreaterThanOrEqual(1);
    }
  });

  test("has fieldset or form groups", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    const hasFieldsetOrForm = manifest.groups.some(
      (g) => g.groupType === "fieldset" || g.groupType === "form",
    );
    expect(hasFieldsetOrForm).toBe(true);
  });

  test("discovers shipping-related group", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);
    expect(hasLabel(manifest, /[Ss]hipping/)).toBe(true);
  });

  test("manifest is valid JSON-serializable", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    // Verify round-trip JSON serialization
    const json = JSON.stringify(manifest);
    const parsed = JSON.parse(json) as CrawlerManifest;

    expect(parsed.groups.length).toBe(manifest.groups.length);
    expect(parsed.url).toBe(manifest.url);
  });
});
