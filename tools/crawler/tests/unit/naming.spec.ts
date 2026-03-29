/**
 * Unit tests for the naming module.
 *
 * Tests label → property name conversion, deduplication, and route inference.
 */

import { test, expect } from "@playwright/test";
import { labelToPropertyName, deduplicateNames, inferRouteName, normalizeRoute } from "../../src/naming.js";

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
    expect(result[0]).toBe("nav");
    expect(result[1]).toBe("header");
    expect(result[2]).toBe("footer");
  });

  test("appends numeric suffix for duplicate labels", () => {
    const result = deduplicateNames(["Nav", "nav-item", "Nav Item"]);
    // "Nav" and "Nav Item" both produce "nav" via camelCase; second gets suffix
    expect(result[0]).toBe("nav");
    expect(result[1]).toBe("navItem");
    expect(result[2]).toBe("navItem2");
  });

  test("deduplicates different labels that produce same camelCase", () => {
    const result = deduplicateNames(["my-item", "my item"]);
    expect(result[0]).toBe("myItem");
    expect(result[1]).toBe("myItem2");
  });

  test("respects overrides", () => {
    const result = deduplicateNames(
      ["product-modal", "toast-notification"],
      { "product-modal": "modal", "toast-notification": "toastMsg" },
    );
    expect(result[0]).toBe("modal");
    expect(result[1]).toBe("toastMsg");
  });

  test("avoids reserved names", () => {
    const result = deduplicateNames(
      ["Navigation", "Footer"],
      undefined,
      ["navigation"],
    );
    // "Navigation" → "navigation" collides with reserved → gets suffix
    expect(result[0]).toBe("navigation2");
    expect(result[1]).toBe("footer");
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

  test("strips numeric last segment, uses parent", () => {
    expect(inferRouteName("http://localhost:3001/products/123")).toBe("products");
  });

  test("returns 'page' for invalid URL", () => {
    expect(inferRouteName("not-a-url")).toBe("page");
  });
});

// ── normalizeRoute ──────────────────────────────────────────

test.describe("normalizeRoute", () => {
  test("preserves static routes", () => {
    expect(normalizeRoute("http://localhost:3000/devices").page).toBe("/devices");
  });

  test("collapses numeric IDs to :id", () => {
    expect(normalizeRoute("http://localhost:3000/devices/123").page).toBe("/devices/:id");
  });

  test("collapses UUIDs to :id", () => {
    expect(normalizeRoute("http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000").page).toBe("/users/:id");
  });

  test("strips action suffix after dynamic segment — edit", () => {
    expect(normalizeRoute("http://localhost:3000/devices/123/edit").page).toBe("/devices/:id");
  });

  test("strips action suffix after dynamic segment — delete", () => {
    expect(normalizeRoute("http://localhost:3000/devices/123/delete").page).toBe("/devices/:id");
  });

  test("strips action suffix after dynamic segment — settings", () => {
    expect(normalizeRoute("http://localhost:3000/devices/123/settings").page).toBe("/devices/:id");
  });

  test("strips action suffix after dynamic segment — details", () => {
    expect(normalizeRoute("http://localhost:3000/users/456/details").page).toBe("/users/:id");
  });

  test("does NOT strip action suffix without dynamic segment", () => {
    expect(normalizeRoute("http://localhost:3000/admin/settings").page).toBe("/admin/settings");
  });

  test("does NOT strip non-action trailing segment", () => {
    expect(normalizeRoute("http://localhost:3000/devices/123/photos").page).toBe("/devices/:id/photos");
  });

  test("handles hash-based routing", () => {
    expect(normalizeRoute("http://localhost:3000/#/devices/123/edit").page).toBe("/devices/:id");
  });

  test("strips query params from hash routes", () => {
    expect(normalizeRoute("http://localhost:3000/#/devices?tab=info").page).toBe("/devices");
  });

  test("strips query params from regular routes", () => {
    expect(normalizeRoute("http://localhost:3000/devices?tab=info").page).toBe("/devices");
  });

  test("returns / for root", () => {
    expect(normalizeRoute("http://localhost:3000/").page).toBe("/");
  });

  test("nested dynamic segments with action suffix", () => {
    expect(normalizeRoute("http://localhost:3000/org/42/users/789/edit").page).toBe("/org/:id/users/:id");
  });
});
