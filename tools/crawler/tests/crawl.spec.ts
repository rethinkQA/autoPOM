/**
 * Integration tests — crawl all 7 fixture apps and validate
 * that the crawler discovers the expected groups.
 *
 * These tests verify that:
 * 1. Group discovery finds landmark/container elements
 * 2. Special wrappers (table, dialog, toast) are correctly identified
 * 3. Labels are extracted from the DOM
 * 4. Manifests are structurally correct
 */

import { test, expect } from "@playwright/test";
import { crawlPage } from "../src/crawler.js";
import type { CrawlerManifest, ManifestGroup, WrapperType } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────

function groupsByWrapper(manifest: CrawlerManifest, type: WrapperType): ManifestGroup[] {
  return manifest.groups.filter((g) => g.wrapperType === type);
}

function groupLabels(manifest: CrawlerManifest): string[] {
  return manifest.groups.map((g) => g.label);
}

function hasGroupWithLabel(manifest: CrawlerManifest, label: string | RegExp): boolean {
  return manifest.groups.some((g) =>
    typeof label === "string" ? g.label === label : label.test(g.label),
  );
}

// ── Tests ───────────────────────────────────────────────────

test.describe("Crawler — Group Discovery", () => {
  test("discovers groups on home page", async ({ page }) => {
    await page.goto("/");

    const manifest = await crawlPage(page);

    // Basic structure
    expect(manifest.url).toContain("localhost");
    expect(manifest.groups.length).toBeGreaterThan(0);
    expect(manifest.passCount).toBe(1);

    // Should find major landmarks
    const labels = groupLabels(manifest);
    expect(labels.length).toBeGreaterThan(3);
  });

  test("discovers header element", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    const headers = manifest.groups.filter((g) => g.groupType === "header");
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  test("discovers nav element", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    const navs = manifest.groups.filter(
      (g) => g.groupType === "nav",
    );
    expect(navs.length).toBeGreaterThanOrEqual(1);
  });

  test("discovers footer element", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    const footers = manifest.groups.filter((g) => g.groupType === "footer");
    expect(footers.length).toBeGreaterThanOrEqual(1);
  });

  test("discovers fieldset groups", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    // The home page has fieldsets for Quantity, Shipping Method, Delivery Date
    const fieldsets = manifest.groups.filter((g) => g.groupType === "fieldset");
    expect(fieldsets.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts fieldset labels from legend", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    // Should find "Quantity", "Shipping Method", "Delivery Date" from fieldset legends
    const hasQuantity = hasGroupWithLabel(manifest, "Quantity");
    const hasShipping = hasGroupWithLabel(manifest, /[Ss]hipping/);
    const hasDelivery = hasGroupWithLabel(manifest, /[Dd]elivery|[Dd]ate/);

    // At least one of the well-known fieldsets should be found
    expect(hasQuantity || hasShipping || hasDelivery).toBe(true);
  });

  test("discovers table as special wrapper", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    const tables = groupsByWrapper(manifest, "table");
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });

  test("discovers dialog as special wrapper (vanilla only — others use portals)", async ({ page, browserName }, testInfo) => {
    // Dialogs in React/Vue/Angular/Svelte/Next.js are portaled/overlay-based
    // and only exist in the DOM when opened. They require pass 2 after user
    // interaction. Vanilla and Lit use always-in-DOM <dialog> elements.
    // Only vanilla keeps <dialog> always in the DOM.
    // Lit conditionally renders <general-store-dialog> (removed when closed).
    // React/Vue/Angular/Svelte/Next.js use portals/overlays.
    const project = testInfo.project.name;
    if (project !== "vanilla") {
      test.skip();
      return;
    }

    await page.goto("/");
    const manifest = await crawlPage(page);

    const dialogs = groupsByWrapper(manifest, "dialog");
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });

  test("discovers toast/live-region (when always in DOM)", async ({ page }, testInfo) => {
    // Toast elements in some frameworks (React/Angular/Svelte/Next.js) are
    // conditionally rendered and may not be in the initial DOM. The crawler's
    // toast detection focuses on elements with role="status" or toast classes.
    await page.goto("/");
    const manifest = await crawlPage(page);

    const toasts = groupsByWrapper(manifest, "toast");
    // Vanilla HTML always has the toast div in DOM (hidden attribute).
    // Other frameworks may conditionally render it.
    const project = testInfo.project.name;
    if (project === "vanilla") {
      expect(toasts.length).toBeGreaterThanOrEqual(1);
    }
    // For all apps, at minimum verify the crawl ran without errors
    expect(manifest.groups.length).toBeGreaterThan(0);
  });

  test("scope option limits discovery", async ({ page }) => {
    await page.goto("/");

    const fullManifest = await crawlPage(page);
    const scopedManifest = await crawlPage(page, { scope: "footer" });

    // Scoped crawl should find fewer groups
    expect(scopedManifest.groups.length).toBeLessThan(fullManifest.groups.length);
    expect(scopedManifest.scope).toBe("footer");
  });

  test("manifest has required fields", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    // Top-level fields
    expect(manifest.url).toBeTruthy();
    expect(manifest.timestamp).toBeTruthy();
    expect(manifest.passCount).toBe(1);
    expect(Array.isArray(manifest.groups)).toBe(true);

    // Each group has required fields
    for (const group of manifest.groups) {
      expect(group.label).toBeTruthy();
      expect(group.selector).toBeTruthy();
      expect(group.groupType).toBeTruthy();
      expect(group.wrapperType).toBeTruthy();
      expect(group.discoveredIn).toBeTruthy();
      expect(group.visibility).toMatch(/^(static|dynamic)$/);
      expect(group.lastSeen).toBeTruthy();
    }
  });
});

test.describe("Crawler — Manifest merge", () => {
  test("multi-pass merge adds new groups", async ({ page }) => {
    await page.goto("/");

    // Pass 1: crawl default state
    const pass1 = await crawlPage(page, { pass: 1 });
    const pass1Count = pass1.groups.length;

    // Pass 2: re-crawl (same state, but simulating append)
    const pass2 = await crawlPage(page, { pass: 2 }, pass1);

    // Merge should preserve all existing groups
    expect(pass2.groups.length).toBeGreaterThanOrEqual(pass1Count);
    expect(pass2.passCount).toBe(2);
  });

  test("merge preserves groups not in current DOM", async ({ page }) => {
    await page.goto("/");

    // Create a fake manifest with an extra group
    const real = await crawlPage(page);
    const fakeGroup: ManifestGroup = {
      label: "Phantom Group",
      selector: "#does-not-exist",
      groupType: "region",
      wrapperType: "group",
      discoveredIn: "pass-1",
      visibility: "dynamic",
      lastSeen: new Date().toISOString(),
    };
    const fakeManifest: CrawlerManifest = {
      ...real,
      groups: [...real.groups, fakeGroup],
    };

    // Re-crawl with the fake manifest
    const merged = await crawlPage(page, { pass: 2 }, fakeManifest);

    // The phantom group should still be in the merged result (append-only)
    const phantom = merged.groups.find((g) => g.selector === "#does-not-exist");
    expect(phantom).toBeDefined();
    expect(phantom!.label).toBe("Phantom Group");
  });

  test("flags date picker fieldsets with needs-adapter note", async ({ page }) => {
    await page.goto("/");
    const manifest = await crawlPage(page);

    // The vanilla app has a "Delivery Date" fieldset
    const dateGroup = manifest.groups.find((g) =>
      /date|delivery|calendar/i.test(g.label),
    );

    // If a date-related group exists, it should be flagged
    if (dateGroup) {
      expect(dateGroup.notes).toBe("needs-adapter");
    }
  });
});
