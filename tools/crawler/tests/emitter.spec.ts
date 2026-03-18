/**
 * Unit tests for the page object emitter.
 *
 * Tests core emission, template detection, diff comparison,
 * and API-aware generation. These are pure TypeScript logic tests
 * — no browser needed.
 */

import { test, expect } from "@playwright/test";
import { emitPageObject, emitMultiRoute, emitTemplate, computeShape, detectTemplates } from "../src/emitter.js";
import { diffPageObjects, formatEmitterDiff, extractProperties } from "../src/emitter-diff.js";
import type { CrawlerManifest, ManifestGroup } from "../src/types.js";
import type { RouteManifest } from "../src/emitter-types.js";

// ── Helpers ─────────────────────────────────────────────────

function makeGroup(overrides: Partial<ManifestGroup> = {}): ManifestGroup {
  return {
    label: "Test Group",
    selector: "fieldset.test",
    groupType: "fieldset",
    wrapperType: "group",
    discoveredIn: "pass-1",
    visibility: "static",
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

function makeManifest(groups: ManifestGroup[], overrides: Partial<CrawlerManifest> = {}): CrawlerManifest {
  return {
    schemaVersion: 1,
    url: "http://localhost:3001/",
    timestamp: new Date().toISOString(),
    scope: null,
    passCount: 1,
    groups,
    ...overrides,
  };
}

// ── emitPageObject ──────────────────────────────────────────

test.describe("emitPageObject", () => {
  test("emits valid TypeScript with imports and function", () => {
    const manifest = makeManifest([
      makeGroup({ label: "nav", selector: "nav", groupType: "nav", wrapperType: "group" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain('import type { Page } from "@playwright/test"');
    expect(result).toContain('import { By, group } from "@playwright-elements/core"');
    expect(result).toContain("export function homePage(page: Page)");
    expect(result).toContain("const root = group(By.css(\"body\"), page)");
    expect(result).toContain("...root,");
  });

  test("uses correct factory for each wrapper type", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Product Table", selector: "table.products", wrapperType: "table" }),
      makeGroup({ label: "Confirm Dialog", selector: '[role="dialog"]', wrapperType: "dialog" }),
      makeGroup({ label: "Notification", selector: '[aria-live="polite"]', wrapperType: "toast" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("table(");
    expect(result).toContain("dialog(");
    expect(result).toContain("toast(");
  });

  test("converts labels to camelCase property names", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Shipping Method", selector: "#shipping", groupType: "fieldset" }),
      makeGroup({ label: "product-modal", selector: "#product-modal", wrapperType: "dialog" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("shippingMethod:");
    expect(result).toContain("productModal:");
  });

  test("infers By.role() for landmark tag selectors", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Main Nav", selector: "nav", groupType: "nav" }),
      makeGroup({ label: "Page Header", selector: "header", groupType: "header" }),
      makeGroup({ label: "Page Footer", selector: "footer", groupType: "footer" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain('By.role("navigation")');
    expect(result).toContain('By.role("banner")');
    expect(result).toContain('By.role("contentinfo")');
  });

  test("uses By.role('group', { name }) for fieldset with aria-label", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "Quantity",
        selector: 'fieldset[aria-label="Quantity"]',
        groupType: "fieldset",
      }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain('By.role("group", { name: "Quantity" })');
  });

  test("uses By.role('group', { name }) for legacy fieldset with legend text-is", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "Quantity",
        selector: 'fieldset:has(> legend:text-is("Quantity"))',
        groupType: "fieldset",
      }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain('By.role("group", { name: "Quantity" })');
  });

  test("uses By.css() for ID selectors", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Modal", selector: "#product-modal", wrapperType: "dialog" }),
    ]);

    const result = emitPageObject(manifest);

    // Dialog wrapper type with non-role selector should still get By.role("dialog")
    expect(result).toContain('By.role("dialog")');
  });

  test("uses By.role('table') for table wrapper type", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Products", selector: "table.data-table", wrapperType: "table" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain('By.role("table")');
  });

  test("emits @generated header", () => {
    const manifest = makeManifest([]);
    const result = emitPageObject(manifest, { generatedMarkers: true });

    expect(result).toContain("// @generated by pw-crawl");
  });

  test("omits @generated header when disabled", () => {
    const manifest = makeManifest([]);
    const result = emitPageObject(manifest, { generatedMarkers: false });

    expect(result).not.toContain("@generated");
  });

  test("respects custom routeName option", () => {
    const manifest = makeManifest([]);
    const result = emitPageObject(manifest, { routeName: "about" });

    expect(result).toContain("export function aboutPage(page: Page)");
  });

  test("respects custom frameworkImport option", () => {
    const manifest = makeManifest([
      makeGroup({ label: "nav", selector: "nav", groupType: "nav" }),
    ]);
    const result = emitPageObject(manifest, { frameworkImport: "../../src/index.js" });

    expect(result).toContain('from "../../src/index.js"');
  });

  test("respects propertyNameOverrides", () => {
    const manifest = makeManifest([
      makeGroup({ label: "toast-notification", selector: "#toast", wrapperType: "toast" }),
    ]);

    const result = emitPageObject(manifest, {
      propertyNameOverrides: { "toast-notification": "toastMsg" },
    });

    expect(result).toContain("toastMsg:");
  });

  test("categorizes groups into sections with comments", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Nav", selector: "nav", groupType: "nav" }),
      makeGroup({ label: "Quantity", selector: "fieldset.qty", groupType: "fieldset" }),
      makeGroup({ label: "Products", selector: "table.data", wrapperType: "table" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("// ── Landmarks");
    expect(result).toContain("// ── Scoped containers");
    expect(result).toContain("// ── Typed wrappers");
  });

  test("emits TODO comment for needs-adapter entries in scoped containers", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "Delivery Date",
        selector: 'fieldset[aria-label="Delivery Date"]',
        groupType: "fieldset",
        notes: "needs-adapter",
      }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("deliveryDate: group(");
    expect(result).toContain("// TODO: add adapter");
  });

  test("emits TODO comment for needs-adapter entries in typed wrappers", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "Schedule Picker",
        selector: "#schedule",
        wrapperType: "dialog",
        notes: "needs-adapter",
      }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("// TODO: add adapter");
  });

  test("emits JSDoc note when any group has needs-adapter", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Delivery Date", selector: "#date", groupType: "fieldset", notes: "needs-adapter" }),
    ]);

    const result = emitPageObject(manifest);

    expect(result).toContain("NOTE: Some elements may need adapter configuration");
  });

  test("handles non-ASCII labels in property names", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "© 2026 GeneralStore — Vanilla HTML",
        selector: "footer",
        groupType: "footer",
      }),
    ]);

    const result = emitPageObject(manifest);

    // Should NOT contain raw © or — in the property name
    expect(result).not.toMatch(/\w*©/);
    // The property name should be a valid JS identifier
    expect(result).toMatch(/_2026GeneralStoreVanillaHtml:/);
  });
});

// ── emitPageObject with API dependencies ────────────────────

test.describe("emitPageObject — waitForReady", () => {
  test("emits waitForReady() from page-load API dependencies", () => {
    const manifest = makeManifest([], {
      apiDependencies: [
        { pattern: "/api/products", method: "GET", timing: "page-load" },
        { pattern: "/api/categories", method: "GET", timing: "page-load" },
      ],
    });

    const result = emitPageObject(manifest);

    expect(result).toContain("export async function waitForReady(page: Page)");
    expect(result).toContain('resp.url().includes("/api/products")');
    expect(result).toContain('resp.url().includes("/api/categories")');
    expect(result).toContain("Promise.all");
  });

  test("omits waitForReady() when no API dependencies", () => {
    const manifest = makeManifest([]);

    const result = emitPageObject(manifest);

    expect(result).not.toContain("waitForReady");
  });

  test("ignores interaction-timing dependencies in waitForReady", () => {
    const manifest = makeManifest([], {
      apiDependencies: [
        { pattern: "/api/products", method: "GET", timing: "page-load" },
        { pattern: "/api/detail", method: "GET", timing: "interaction" },
      ],
    });

    const result = emitPageObject(manifest);

    expect(result).toContain("/api/products");
    expect(result).not.toContain("/api/detail");
  });

  test("uses single await (not Promise.all) for single dependency", () => {
    const manifest = makeManifest([], {
      apiDependencies: [
        { pattern: "/api/products", method: "GET", timing: "page-load" },
      ],
    });

    const result = emitPageObject(manifest);

    expect(result).toContain("waitForReady");
    expect(result).not.toContain("Promise.all");
  });

  test("omits waitForReady when emitWaitForReady is false", () => {
    const manifest = makeManifest([], {
      apiDependencies: [
        { pattern: "/api/products", method: "GET", timing: "page-load" },
      ],
    });

    const result = emitPageObject(manifest, { emitWaitForReady: false });

    expect(result).not.toContain("waitForReady");
  });
});

// ── computeShape ────────────────────────────────────────────

test.describe("computeShape", () => {
  test("produces sorted shape entries", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
      makeGroup({ label: "Table", selector: "table.data", wrapperType: "table" }),
    ]);

    const shape = computeShape(manifest);

    expect(shape).toHaveLength(2);
    // Sorted by wrapperType then selectorPattern
    expect(shape[0].wrapperType).toBe("group");
    expect(shape[1].wrapperType).toBe("table");
  });

  test("normalizes selectors for shape comparison", () => {
    const manifest = makeManifest([
      makeGroup({
        label: "Quantity",
        selector: 'fieldset[aria-label="Quantity"]',
        wrapperType: "group",
      }),
    ]);

    const shape = computeShape(manifest);

    expect(shape[0].selectorPattern).toContain("[aria-label=*]");
    expect(shape[0].selectorPattern).not.toContain("Quantity");
  });

  test("normalizes IDs and aria-labels to wildcards", () => {
    const manifest = makeManifest([
      makeGroup({ label: "Modal", selector: "#product-modal", wrapperType: "dialog" }),
      makeGroup({ label: "Region", selector: '[aria-label="My Region"]', wrapperType: "group" }),
    ]);

    const shape = computeShape(manifest);

    expect(shape.some((s) => s.selectorPattern.includes("#*"))).toBe(true);
    expect(shape.some((s) => s.selectorPattern.includes("[aria-label=*]"))).toBe(true);
  });
});

// ── detectTemplates ─────────────────────────────────────────

test.describe("detectTemplates", () => {
  test("detects routes with identical shapes as a template", () => {
    const route1: RouteManifest = {
      route: "home",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        makeGroup({ label: "Footer", selector: "footer", wrapperType: "group" }),
      ]),
    };
    const route2: RouteManifest = {
      route: "about",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        makeGroup({ label: "Footer", selector: "footer", wrapperType: "group" }),
      ], { url: "http://localhost:3001/#about" }),
    };

    const { templates, standalone } = detectTemplates([route1, route2]);

    expect(templates).toHaveLength(1);
    expect(templates[0].routes).toContain("home");
    expect(templates[0].routes).toContain("about");
    expect(standalone).toHaveLength(0);
  });

  test("treats routes with different shapes as standalone", () => {
    const route1: RouteManifest = {
      route: "home",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        makeGroup({ label: "Table", selector: "table", wrapperType: "table" }),
      ]),
    };
    const route2: RouteManifest = {
      route: "about",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
      ], { url: "http://localhost:3001/#about" }),
    };

    const { templates, standalone } = detectTemplates([route1, route2]);

    expect(templates).toHaveLength(0);
    expect(standalone).toHaveLength(2);
  });

  test("single route is always standalone", () => {
    const route: RouteManifest = {
      route: "home",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
      ]),
    };

    const { templates, standalone } = detectTemplates([route]);

    expect(templates).toHaveLength(0);
    expect(standalone).toHaveLength(1);
  });
});

// ── emitMultiRoute ──────────────────────────────────────────

test.describe("emitMultiRoute", () => {
  test("produces single file for single route", () => {
    const routes: RouteManifest[] = [{
      route: "home",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", groupType: "nav", wrapperType: "group" }),
      ]),
    }];

    const files = emitMultiRoute(routes);

    expect(files.size).toBe(1);
    expect(files.has("home-page.ts")).toBe(true);
    expect(files.get("home-page.ts")).toContain("homePage");
  });

  test("produces standalone files for routes with different shapes", () => {
    const routes: RouteManifest[] = [
      {
        route: "home",
        manifest: makeManifest([
          makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
          makeGroup({ label: "Table", selector: "table", wrapperType: "table" }),
        ]),
      },
      {
        route: "about",
        manifest: makeManifest([
          makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        ], { url: "http://localhost:3001/#about" }),
      },
    ];

    const files = emitMultiRoute(routes);

    expect(files.size).toBe(2);
    expect(files.has("home-page.ts")).toBe(true);
    expect(files.has("about-page.ts")).toBe(true);
  });

  test("returns empty map for empty input", () => {
    const files = emitMultiRoute([]);
    expect(files.size).toBe(0);
  });
});

// ── emitTemplate (varying labels) ───────────────────────────

test.describe("emitTemplate — varying labels", () => {
  test("emits named config properties in per-route factories", () => {
    const route1: RouteManifest = {
      route: "home",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        makeGroup({ label: "Products Table", selector: "table.data", wrapperType: "table" }),
      ]),
    };
    const route2: RouteManifest = {
      route: "orders",
      manifest: makeManifest([
        makeGroup({ label: "Nav", selector: "nav", wrapperType: "group" }),
        makeGroup({ label: "Orders Table", selector: "table.data", wrapperType: "table" }),
      ], { url: "http://localhost:3001/orders" }),
    };

    const { templates } = detectTemplates([route1, route2]);
    expect(templates).toHaveLength(1);

    const result = emitTemplate(templates[0], [route1, route2]);

    // Should have a TemplateConfig interface with a named property
    expect(result).toContain("interface TemplateConfig");
    // Per-route factories should use named config properties, not bare strings
    expect(result).toMatch(/homePage.*=.*\(page.*\).*=>.*\{.*Label:.*"Products Table"/);
    expect(result).toMatch(/ordersPage.*=.*\(page.*\).*=>.*\{.*Label:.*"Orders Table"/);
    // Should NOT have bare comma-separated strings without property names
    expect(result).not.toMatch(/\{ "Products Table", "Orders Table" \}/);
  });
});

// ── diffPageObjects ─────────────────────────────────────────

test.describe("diffPageObjects", () => {
  test("reports no diff for identical sources", () => {
    const source = `
    export function homePage(page: Page) {
      const root = group(By.css("body"), page);
      return {
        ...root,
        nav: group(By.role("navigation"), page),
      };
    }`;

    const diff = diffPageObjects(source, source);

    expect(diff.unchanged).toBe(true);
    expect(diff.addedProperties).toHaveLength(0);
    expect(diff.removedProperties).toHaveLength(0);
    expect(diff.changedProperties).toHaveLength(0);
  });

  test("detects added properties", () => {
    const existing = `
    return {
      nav: group(By.role("navigation"), page),
    };`;

    const generated = `
    return {
      nav: group(By.role("navigation"), page),
      footer: group(By.role("contentinfo"), page),
    };`;

    const diff = diffPageObjects(generated, existing);

    expect(diff.addedProperties).toContain("footer");
  });

  test("detects removed properties", () => {
    const existing = `
    return {
      nav: group(By.role("navigation"), page),
      footer: group(By.role("contentinfo"), page),
    };`;

    const generated = `
    return {
      nav: group(By.role("navigation"), page),
    };`;

    const diff = diffPageObjects(generated, existing);

    expect(diff.removedProperties).toContain("footer");
  });

  test("detects changed properties", () => {
    const existing = `
    return {
      nav: group(By.css("nav"), page),
    };`;

    const generated = `
    return {
      nav: group(By.role("navigation"), page),
    };`;

    const diff = diffPageObjects(generated, existing);

    expect(diff.changedProperties).toHaveLength(1);
    expect(diff.changedProperties[0].name).toBe("nav");
  });
});

// ── extractProperties ───────────────────────────────────────

test.describe("extractProperties", () => {
  test("extracts simple property declarations", () => {
    const source = `
    return {
      nav: group(By.role("navigation"), page),
      footer: group(By.role("contentinfo"), page),
    };`;

    const props = extractProperties(source);

    expect(props.size).toBe(2);
    expect(props.get("nav")).toBe('group(By.role("navigation"), page)');
    expect(props.get("footer")).toBe('group(By.role("contentinfo"), page)');
  });

  test("handles properties with trailing comments", () => {
    const source = `
    return {
      modal: dialog(By.role("dialog"), page), // needs-adapter
    };`;

    const props = extractProperties(source);

    expect(props.has("modal")).toBe(true);
  });
});

// ── formatEmitterDiff ───────────────────────────────────────

test.describe("formatEmitterDiff", () => {
  test("returns success message when unchanged", () => {
    const diff = {
      addedProperties: [],
      removedProperties: [],
      changedProperties: [],
      unchanged: true,
    };

    const output = formatEmitterDiff(diff);

    expect(output).toContain("✓");
    expect(output).toContain("no drift");
  });

  test("formats added/removed/changed sections", () => {
    const diff = {
      addedProperties: ["footer"],
      removedProperties: ["sidebar"],
      changedProperties: [{ name: "nav", before: "old", after: "new" }],
      unchanged: false,
    };

    const output = formatEmitterDiff(diff);

    expect(output).toContain("⚠");
    expect(output).toContain("+ footer");
    expect(output).toContain("- sidebar");
    expect(output).toContain("~ nav");
  });
});
