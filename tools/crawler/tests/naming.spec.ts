/**
 * Unit tests for the naming module.
 *
 * Tests label → property name conversion, deduplication, and route inference.
 */

import { test, expect } from "@playwright/test";
import { labelToPropertyName, deduplicateNames, inferRouteName } from "../src/naming.js";

// ── labelToPropertyName ─────────────────────────────────────

test.describe("labelToPropertyName", () => {
  test("converts multi-word labels to camelCase", () => {
    expect(labelToPropertyName("Shipping Method")).toBe("shippingMethod");
  });

  test("converts hyphenated labels to camelCase", () => {
    expect(labelToPropertyName("product-modal")).toBe("productModal");
  });

  test("converts underscored labels to camelCase", () => {
    expect(labelToPropertyName("toast_notification")).toBe("toastNotification");
  });

  test("keeps single lowercase word as-is", () => {
    expect(labelToPropertyName("nav")).toBe("nav");
    expect(labelToPropertyName("footer")).toBe("footer");
  });

  test("handles multi-word with mixed case", () => {
    expect(labelToPropertyName("GeneralStore Vanilla HTML")).toBe("generalStoreVanillaHtml");
  });

  test("returns 'unnamed' for empty string", () => {
    expect(labelToPropertyName("")).toBe("unnamed");
  });

  test("returns 'unnamed' for whitespace-only", () => {
    expect(labelToPropertyName("   ")).toBe("unnamed");
  });

  test("prefixes underscore for numeric-leading names", () => {
    expect(labelToPropertyName("123-items")).toBe("_123Items");
  });

  test("appends 'Section' suffix for reserved words", () => {
    expect(labelToPropertyName("class")).toBe("classSection");
    expect(labelToPropertyName("import")).toBe("importSection");
    expect(labelToPropertyName("page")).toBe("pageSection");
  });

  test("handles dots and special chars as separators", () => {
    expect(labelToPropertyName("item.list")).toBe("itemList");
    expect(labelToPropertyName("item;list")).toBe("itemList");
  });

  test("strips non-ASCII characters (©, —, ⇅, etc.)", () => {
    expect(labelToPropertyName("© 2026 GeneralStore — Vanilla HTML")).toBe(
      "_2026GeneralStoreVanillaHtml",
    );
  });

  test("strips unicode arrows from table labels", () => {
    expect(labelToPropertyName("Name ⇅")).toBe("name");
  });

  test("returns 'unnamed' when label is entirely non-ASCII", () => {
    expect(labelToPropertyName("⇅⇅⇅")).toBe("unnamed");
  });

  test("handles emoji in labels gracefully", () => {
    expect(labelToPropertyName("🛒 Cart Items")).toBe("cartItems");
  });
});

// ── deduplicateNames ────────────────────────────────────────

test.describe("deduplicateNames", () => {
  test("generates unique names for labels", () => {
    const result = deduplicateNames(["Nav", "Header", "Footer"]);
    expect(result.get("Nav")).toBe("nav");
    expect(result.get("Header")).toBe("header");
    expect(result.get("Footer")).toBe("footer");
  });

  test("appends numeric suffix for duplicate labels", () => {
    // When the same label appears multiple times, Map keeps the last assignment.
    // The dedup logic still runs for each entry (nav, nav2, nav3) but the Map
    // stores only one value per key. Use distinct labels for a meaningful test.
    const result = deduplicateNames(["Nav", "nav-item", "Nav Item"]);
    // "Nav" and "Nav Item" both become "nav", second one gets suffix
    expect(result.get("Nav")).toBe("nav");
    expect(result.get("nav-item")).toBe("navItem");
    expect(result.get("Nav Item")).toBe("navItem2");
  });

  test("deduplicates different labels that produce same camelCase", () => {
    const result = deduplicateNames(["my-item", "my item"]);
    expect(result.get("my-item")).toBe("myItem");
    expect(result.get("my item")).toBe("myItem2");
  });

  test("respects overrides", () => {
    const result = deduplicateNames(
      ["product-modal", "toast-notification"],
      { "product-modal": "modal", "toast-notification": "toastMsg" },
    );
    expect(result.get("product-modal")).toBe("modal");
    expect(result.get("toast-notification")).toBe("toastMsg");
  });
});

// ── inferRouteName ──────────────────────────────────────────

test.describe("inferRouteName", () => {
  test("returns 'home' for root path", () => {
    expect(inferRouteName("http://localhost:3001/")).toBe("home");
  });

  test("returns 'about' for /about path", () => {
    expect(inferRouteName("http://localhost:3001/about")).toBe("about");
  });

  test("returns 'about' for #about hash", () => {
    expect(inferRouteName("http://localhost:3001/#about")).toBe("about");
  });

  test("builds camelCase from multi-segment path", () => {
    expect(inferRouteName("http://localhost:3001/products/list")).toBe("productsList");
  });

  test("replaces numeric last segment with 'detail'", () => {
    expect(inferRouteName("http://localhost:3001/products/123")).toBe("productsDetail");
  });

  test("returns 'page' for invalid URL", () => {
    expect(inferRouteName("not-a-url")).toBe("page");
  });
});
