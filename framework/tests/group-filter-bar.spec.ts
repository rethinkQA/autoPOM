import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Group — Filter Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("set and get text input via label", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Search Products", "mouse");
    expect(await home.filters.read("Search Products")).toBe("mouse");
    expect(await home.productTable.rowCount()).toBe(1);
  });

  test("set and get select dropdown via label", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Category", "Electronics");
    expect(await home.filters.read("Category")).toBe("Electronics");
    expect(await home.productTable.rowCount()).toBe(3);
  });

  test("set and get checkbox via label", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Show only in-stock items", true);
    expect(await home.filters.read("Show only in-stock items")).toBe(true);
    expect(await home.productTable.rowCount()).toBe(5);
  });

  test("uncheck checkbox via label", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Show only in-stock items", true);
    await home.filters.write("Show only in-stock items", false);
    expect(await home.filters.read("Show only in-stock items")).toBe(false);
    expect(await home.productTable.rowCount()).toBe(7);
  });

  test("AND composition — text + category + in-stock", async ({ page }) => {
    const home = homePage(page);
    await home.filters.writeAll({
      "Category": "Electronics",
      "Show only in-stock items": true,
    });
    // Electronics + in-stock = Wireless Mouse, Bluetooth Keyboard
    expect(await home.productTable.rowCount()).toBe(2);
  });

  test("writeAll applies multiple fields at once", async ({ page }) => {
    const home = homePage(page);
    await home.filters.writeAll({
      "Search Products": "mouse",
      "Category": "Electronics",
      "Show only in-stock items": true,
    });
    expect(await home.productTable.rowCount()).toBe(1);
  });

  test("readAll reads multiple fields at once", async ({ page }) => {
    const home = homePage(page);
    await home.filters.writeAll({
      "Search Products": "keyboard",
      "Category": "Electronics",
      "Show only in-stock items": true,
    });
    const values = await home.filters.readAll([
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

  test("reset filters restores full table", async ({ page }) => {
    const home = homePage(page);
    await home.filters.writeAll({
      "Search Products": "mouse",
      "Category": "Electronics",
      "Show only in-stock items": true,
    });

    // Reset all at once
    await home.filters.writeAll({
      "Search Products": "",
      "Category": "All",
      "Show only in-stock items": false,
    });
    expect(await home.productTable.rowCount()).toBe(7);
  });

  test("filter to zero results shows empty state", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Search Products", "zzzzz");
    expect(await home.productTable.isEmpty()).toBe(true);
    expect(await home.productTable.emptyText()).toBe("No products found.");
  });

  test("page-level write/read scans body for labeled elements", async ({ page }) => {
    const home = homePage(page);
    // write/read directly on page — no need to go through home.filters
    await home.write("Search Products", "keyboard");
    expect(await home.read("Search Products")).toBe("keyboard");
    expect(await home.productTable.rowCount()).toBe(1);
  });

  test("page-level writeAll/readAll applies batch to body", async ({ page }) => {
    const home = homePage(page);
    // Page-level works for globally unique labels.
    // "Category" is ambiguous at body scope (select + th header),
    // so we use the scoped filters container for that one.
    await home.writeAll({
      "Search Products": "mouse",
      "Show only in-stock items": true,
    });
    const values = await home.readAll([
      "Search Products",
      "Show only in-stock items",
    ]);
    expect(values).toEqual({
      "Search Products": "mouse",
      "Show only in-stock items": true,
    });
    expect(await home.productTable.rowCount()).toBe(1);
  });

  test("category filter includes all expected options", async ({ page }) => {
    const home = homePage(page);
    // Write each category and verify it filters correctly
    for (const category of ["Electronics", "Books", "Clothing"]) {
      await home.filters.write("Category", category);
      expect(await home.filters.read("Category")).toBe(category);
      expect(await home.productTable.rowCount()).toBeGreaterThan(0);
    }
    // "All" should restore full table
    await home.filters.write("Category", "All");
    expect(await home.productTable.rowCount()).toBe(7);
  });
});
