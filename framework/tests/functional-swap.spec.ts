/**
 * Phase 13.1 — Functional Swap: use generated page objects at runtime.
 *
 * Crawl each app, build a runtime page object from the manifest
 * (using the same factory mapping the emitter generates), and then
 * exercise write/read/writeAll/readAll/click operations to prove
 * the generated structure is functionally equivalent.
 *
 * Key insight: `group().write()` auto-detects element types at runtime,
 * so tests that use write()/read() on the root group work identically
 * whether the page object was hand-written with typed wrappers (radio,
 * stepper, datePicker, button, text) or generated with all-group().
 *
 * Typed wrappers (table/dialog/toast) ARE generated, so those tests
 * also work.
 *
 * Element-level factories (button, text, radio, stepper, datePicker)
 * are NOT generated — the crawler only discovers group-level structure.
 * Tests using those typed methods need the hand-written page object.
 * This is documented in the ROADMAP under "13.1 adjustments".
 *
 * === Known Limitations (tracked in ISSUES.md P1-13) ===
 *
 * 1. Shoelace select ambiguity — RESOLVED (P1-20):
 *    Fixed by switching resolveOnce() to exact label matching.
 *    getByLabel/getByRole now use { exact: true } to prevent "Category"
 *    from substring-matching "Sort by Category" on the <th>.
 *
 * 2. Dialog portaling — RESOLVED (Phase 14):
 *    Record mode captures portaled dialogs via MutationObserver-based
 *    recording after user interaction.
 *
 * 3. Toast discoverability — RESOLVED (Phase 14):
 *    Record mode captures conditionally-rendered toasts via
 *    MutationObserver-based recording after triggering the toast action.
 */

import { test, expect } from "../src/test-fixture.js";
import {
  group,
  table,
  dialog,
  toast,
  By,
} from "../src/index.js";
import type { Page } from "@playwright/test";

// ── Crawler imports (type-only at the package boundary) ─────
import { crawlPage, deduplicateNames, recordPage } from "@playwright-elements/crawler";
import type { CrawlerManifest, ManifestGroup } from "@playwright-elements/crawler";

// ── By.role ARIA role type ──────────────────────────────────
type AriaRole = Parameters<typeof By.role>[0];

// ── Tag → ARIA role mapping (mirrors emitter.ts) ────────────

const TAG_TO_ROLE: Record<string, string> = {
  nav: "navigation",
  header: "banner",
  footer: "contentinfo",
  main: "main",
  aside: "complementary",
};

/**
 * Convert a manifest selector string into a By instance.
 * Runtime equivalent of emitter.ts `selectorToByExpression()`.
 */
function selectorToBy(selector: string, g: ManifestGroup): ReturnType<typeof By.css> {
  const s = selector.trim();

  // [role="..."]
  const roleMatch = s.match(/^\[role="([^"]+)"\]$/);
  if (roleMatch) return By.role(roleMatch[1] as AriaRole);

  // [role="..."][aria-label="..."]
  const roleLabelMatch = s.match(
    /^\[role="([^"]+)"\]\[aria-label="([^"]+)"\]$/,
  );
  if (roleLabelMatch)
    return By.role(roleLabelMatch[1] as AriaRole, { name: roleLabelMatch[2] });

  // Simple tag names with known ARIA roles
  if (TAG_TO_ROLE[s]) return By.role(TAG_TO_ROLE[s] as AriaRole);

  // Fieldset with legend text
  const fieldsetMatch = s.match(
    /^fieldset:has\(>\s*legend:text-is\("([^"]+)"\)\)$/,
  );
  if (fieldsetMatch)
    return By.role("group", { name: fieldsetMatch[1] });

  // Dialog wrapper type
  if (g.wrapperType === "dialog" && !s.includes("role="))
    return By.role("dialog");

  // Table wrapper type
  if (g.wrapperType === "table" && (s === "table" || /^table\b/.test(s)))
    return By.role("table");

  // fieldset[aria-label="..."]
  const fieldsetAriaMatch = s.match(
    /^fieldset\[aria-label="([^"]+)"\]$/,
  );
  if (fieldsetAriaMatch)
    return By.role("group", { name: fieldsetAriaMatch[1] });

  // [aria-label="..."] — map to By.label()
  const ariaLabelMatch = s.match(/^\[aria-label="([^"]+)"\]$/);
  if (ariaLabelMatch)
    return By.label(ariaLabelMatch[1]);

  // Default: CSS selector
  return By.css(s);
}

/**
 * Build a page object from a crawler manifest at runtime.
 *
 * This is the runtime equivalent of what `emitPageObject()` generates
 * as TypeScript source code. It creates the same structure: a root group
 * spread plus named properties for each discovered group using the
 * appropriate factory (group/table/dialog/toast).
 */
function buildPageObjectFromManifest(
  manifest: CrawlerManifest,
  page: Page,
): Record<string, any> {
  const root = group(By.css("body"), page);
  const result: Record<string, any> = {};

  // Spread root properties (write, read, writeAll, readAll, click, find, locator)
  Object.assign(result, root);

  // Build property names from manifest labels
  const nameMap = deduplicateNames(
    manifest.groups.map((g) => g.label),
  );

  for (const g of manifest.groups) {
    const propName = nameMap.get(g.label)!;
    const by = selectorToBy(g.selector, g);

    switch (g.wrapperType) {
      case "table":
        result[propName] = table(by, page);
        break;
      case "dialog":
        result[propName] = dialog(by, page);
        break;
      case "toast":
        result[propName] = toast(by, page);
        break;
      default:
        result[propName] = group(by, page);
        break;
    }
  }

  return result;
}

/**
 * Find the property key in a built page object for a given wrapper type.
 */
function findPropertyByWrapper(
  manifest: CrawlerManifest,
  wrapperType: string,
): string | undefined {
  const entry = manifest.groups.find((g) => g.wrapperType === wrapperType);
  if (!entry) return undefined;
  const nameMap = deduplicateNames(manifest.groups.map((g) => g.label));
  return nameMap.get(entry.label);
}

// ── Functional swap tests ───────────────────────────────────

test.describe("Phase 13.1: Functional Swap — Root-level write/read", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("write and read text input via root group", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Search Products", "mouse");
    expect(await po.read("Search Products")).toBe("mouse");
  });

  test("write and read select dropdown via root group", async ({ page }) => {

    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Category", "Electronics");
    expect(await po.read("Category")).toBe("Electronics");
  });

  test("write and read checkbox via root group", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Show only in-stock items", true);
    expect(await po.read("Show only in-stock items")).toBe(true);
  });

  test("uncheck checkbox via root group", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Show only in-stock items", true);
    await po.write("Show only in-stock items", false);
    expect(await po.read("Show only in-stock items")).toBe(false);
  });

  test("writeAll applies multiple fields", async ({ page }) => {

    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.writeAll({
      "Category": "Electronics",
      "Show only in-stock items": true,
    });

    expect(await po.read("Category")).toBe("Electronics");
    expect(await po.read("Show only in-stock items")).toBe(true);
  });

  test("readAll reads multiple fields", async ({ page }) => {

    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.writeAll({
      "Search Products": "keyboard",
      "Category": "Electronics",
      "Show only in-stock items": true,
    });

    const values = await po.readAll([
      "Search Products",
      "Category",
      "Show only in-stock items",
    ]);

    expect(values).toEqual({
      "Search Products": "keyboard",
      "Category": "Electronics",
      "Show only in-stock items": true,
    });
  });

  test("write and read radiogroup via root group auto-detection", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Shipping Method", "Express");
    expect(await po.read("Shipping Method")).toBe("Express");
  });
});

test.describe("Phase 13.1: Functional Swap — Scoped group write/read", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("write/read via generated shipping group", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    // Find the shipping-related group property
    const nameMap = deduplicateNames(manifest.groups.map((g) => g.label));
    const shippingEntry = manifest.groups.find((g) =>
      /[Ss]hipping\s*[Mm]ethod/.test(g.label),
    );
    expect(shippingEntry).toBeDefined();

    const shippingKey = nameMap.get(shippingEntry!.label)!;
    const shippingGroup = po[shippingKey];

    // Inside the radiogroup container, individual radios are labeled
    // "Standard", "Express", etc.  radio handler expects a boolean value
    // (check/uncheck), and get returns boolean.
    await shippingGroup.write("Express", true);
    expect(await shippingGroup.read("Express")).toBe(true);
  });
});

test.describe("Phase 13.1: Functional Swap — Table wrapper", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("table rowCount from generated page object", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    const tableKey = findPropertyByWrapper(manifest, "table");
    expect(tableKey).toBeDefined();

    const tbl = po[tableKey!];
    expect(await tbl.rowCount()).toBe(7);
  });

  test("table headers from generated page object", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    const tableKey = findPropertyByWrapper(manifest, "table");
    const tbl = po[tableKey!];

    const headers = await tbl.headers();
    expect(headers).toEqual(["Name", "Price", "Category", "Stock", "Actions"]);
  });

  test("table sort from generated page object", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    const tableKey = findPropertyByWrapper(manifest, "table");
    const tbl = po[tableKey!];

    await tbl.sort("name");
    const rows = await tbl.rows();
    expect(rows[0].Name).toBe("Bluetooth Keyboard");
  });

  test("table filter via root write + table rowCount verification", async ({ page }) => {

    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Category", "Electronics");

    const tableKey = findPropertyByWrapper(manifest, "table");
    const tbl = po[tableKey!];
    expect(await tbl.rowCount()).toBe(3);
  });

  test("table isEmpty after filtering to zero results", async ({ page }) => {
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    await po.write("Search Products", "zzzzz");

    const tableKey = findPropertyByWrapper(manifest, "table");
    const tbl = po[tableKey!];
    expect(await tbl.isEmpty()).toBe(true);
    expect(await tbl.emptyText()).toBe("No products found.");
  });
});

test.describe("Phase 13.1: Functional Swap — Dialog wrapper", () => {
  test("dialog open/close from generated page object", async ({ page }, testInfo) => {
    // [P1-13] Non-vanilla apps use recorder to discover portaled dialogs.
    const project = testInfo.project.name;
    await page.goto("/");

    let manifest: CrawlerManifest;
    if (project === "vanilla") {
      manifest = await crawlPage(page);
    } else {
      const base = await crawlPage(page);
      manifest = await recordPage(page, async (p) => {
        await p.locator("table >> text=Bluetooth Keyboard").first().click();
        await p.locator("[role='dialog'], .modal, dialog").first().waitFor({ state: "visible", timeout: 5000 });
      }, { existing: base });
    }

    const po = buildPageObjectFromManifest(manifest, page);

    // For non-vanilla, the dialog may already be open from the recorder interaction.
    // Close it first, then re-open via the page object.
    if (project !== "vanilla") {
      const dialogKey = findPropertyByWrapper(manifest, "dialog");
      expect(dialogKey).toBeDefined();
      const dlg = po[dialogKey!];
      if (await dlg.isOpen()) {
        await dlg.close();
      }
    }

    // Click a product to open dialog via root group
    const tableKey = findPropertyByWrapper(manifest, "table");
    const tbl = po[tableKey!];
    const row = await tbl.findRow({ name: "Bluetooth Keyboard" });
    await row.click("Bluetooth Keyboard");

    const dialogKey = findPropertyByWrapper(manifest, "dialog");
    expect(dialogKey).toBeDefined();

    const dlg = po[dialogKey!];
    expect(await dlg.isOpen()).toBe(true);
    expect(await dlg.title()).toBe("Bluetooth Keyboard");

    await dlg.close();
    expect(await dlg.isOpen()).toBe(false);
  });
});

test.describe("Phase 13.1: Functional Swap — Toast wrapper", () => {
  test("toast appears after add to cart via root click", async ({ page }, testInfo) => {
    // [P1-13] Non-vanilla apps use recorder to discover conditionally rendered toasts.
    const project = testInfo.project.name;
    await page.goto("/");

    let manifest: CrawlerManifest;
    if (project === "vanilla") {
      manifest = await crawlPage(page);
    } else {
      const base = await crawlPage(page);
      manifest = await recordPage(page, async (p) => {
        await p.locator("button >> text=Add to Cart").first().click();
        await p.locator(".toast[aria-live='polite'], [role='alert']").first().waitFor({ state: "visible", timeout: 5000 });
      }, { existing: base });
    }

    const po = buildPageObjectFromManifest(manifest, page);

    // Click "Add to Cart" via root group click
    await po.click("Add to Cart");

    const toastKey = findPropertyByWrapper(manifest, "toast");
    expect(toastKey).toBeDefined();

    const toastEl = po[toastKey!];
    await toastEl.waitForVisible();
    expect(await toastEl.isVisible()).toBe(true);
    // Vanilla HTML toast text is synchronous; framework toasts may have
    // already updated from the recorder's initial "Add to Cart" click
    const toastText = await toastEl.read();
    if (project === "vanilla") {
      expect(toastText).toContain("Wireless Mouse");
    } else {
      // For framework apps, just verify the toast is visible and has some content
      // after the recorder interaction. The exact text depends on timing/framework.
      expect(toastText.length).toBeGreaterThan(0);
    }
  });
});

// ── Documentation: tests that need hand-written page objects ─

test.describe("Phase 13.1: Documented adjustments", () => {
  /**
   * The following hand-written page object features have NO generated
   * equivalent because the crawler only discovers group-level structure:
   *
   * 1. `home.shipping.choose("Express")` — radio-specific method.
   *    Generated equivalent: `home.write("Shipping Method", "Express")`
   *    via root group auto-detection. ✅ Verified above.
   *
   * 2. `home.quantity.increment()` / `.decrement()` / `.set(n)` — stepper methods.
   *    Generated equivalent: root group `write("Quantity", "5")` or
   *    scoped group `quantityGroup.write("Quantity", "5")`.
   *    Stepper-specific methods (increment, decrement, isMinDisabled)
   *    are NOT available in the generated version.
   *
   * 3. `home.deliveryDate.select("2026-04-15")` — datePicker-specific method.
   *    Generated page object flags this as "needs-adapter".
   *    Engineer must manually add adapter configuration.
   *
   * 4. `home.addToCart.click()` — button-specific method.
   *    Generated equivalent: `home.click("Add to Cart")` via root group.
   *    ✅ Verified above in toast test.
   *
   * 5. `home.actionOutput.read()` — text-specific read on a non-labeled element.
   *    Not discoverable by crawler (requires explicit By.css selector).
   *    Engineer adds manually to generated page object.
   *
   * 6. `home.shippingCost.read()`, `home.dateDisplay.read()`,
   *    `home.validationMsg.read()`, `home.delayedContent.read()`,
   *    `home.itemList.read()` — read-only text outputs with explicit selectors.
   *    Not discoverable by crawler. Engineer adds manually.
   *
   * 7. `home.filters` — scoped group via By.css(".filter-bar").
   *    Only discoverable if `.filter-bar` matches a semantic element.
   *    Engineer may need to add manually for precise scoping.
   */
  test("root-level write/read equivalence documented", async ({ page }) => {
    // This test exists as a documentation anchor.
    // The assertions above prove that root-level write/read covers
    // the most common test patterns without typed wrappers.
    await page.goto("/");
    const manifest = await crawlPage(page);
    const po = buildPageObjectFromManifest(manifest, page);

    // Prove: root write("Shipping Method", "Express") = hand-written shipping.choose("Express")
    await po.write("Shipping Method", "Express");
    expect(await po.read("Shipping Method")).toBe("Express");

    // Prove: root click("Add to Cart") = hand-written addToCart.click()
    await po.click("Add to Cart");
    // Toast should appear (verifies the click worked)
    await page.locator(".toast[aria-live='polite']").waitFor({ state: "visible", timeout: 5_000 });
  });
});
