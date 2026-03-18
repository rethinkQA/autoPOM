import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Table — data, headers, sorting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("headers returns column names stripped of sort indicators", async ({ page }) => {
    const home = homePage(page);
    const headers = await home.productTable.headers();
    expect(headers).toEqual(["Name", "Price", "Category", "Stock", "Actions"]);
  });

  test("rowCount returns 7 on initial load", async ({ page }) => {
    const home = homePage(page);
    expect(await home.productTable.rowCount()).toBe(7);
  });

  test("rows returns canonical product data", async ({ page }) => {
    const home = homePage(page);
    const rows = await home.productTable.rows();
    expect(rows).toHaveLength(7);

    // Verify first product (insertion order)
    expect(rows[0].Name).toBe("Wireless Mouse");
    expect(rows[0].Price).toBe("$29.99");
    expect(rows[0].Category).toBe("Electronics");
    expect(rows[0].Stock).toBe("Yes");

    // Verify last product
    expect(rows[6].Name).toBe("Science Fiction Novel");
    expect(rows[6].Price).toBe("$14.99");
  });

  test("sort by name ascending", async ({ page }) => {
    const home = homePage(page);
    await home.productTable.sort("name");
    const rows = await home.productTable.rows();
    expect(rows[0].Name).toBe("Bluetooth Keyboard");
    expect(rows[rows.length - 1].Name).toBe("Wireless Mouse");
  });

  test("sort by name descending (second click)", async ({ page }) => {
    const home = homePage(page);
    await home.productTable.sort("name");
    await home.productTable.sort("name");
    const rows = await home.productTable.rows();
    expect(rows[0].Name).toBe("Wireless Mouse");
    expect(rows[rows.length - 1].Name).toBe("Bluetooth Keyboard");
  });

  test("sort by price ascending", async ({ page }) => {
    const home = homePage(page);
    await home.productTable.sort("price");
    const rows = await home.productTable.rows();
    expect(rows[0].Price).toBe("$14.99");
    expect(rows[rows.length - 1].Price).toBe("$129.99");
  });

  test("isEmpty returns false when table has data", async ({ page }) => {
    const home = homePage(page);
    expect(await home.productTable.isEmpty()).toBe(false);
  });

  test("isEmpty and emptyText after filtering to zero results", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Search Products", "zzzzz");
    expect(await home.productTable.isEmpty()).toBe(true);
    expect(await home.productTable.emptyText()).toBe("No products found.");
  });

  test("emptyText throws ElementNotFoundError on non-empty table", async ({ page }) => {
    const home = homePage(page);
    await expect(home.productTable.emptyText()).rejects.toThrow(/No empty-state element found/);
  });

  test("sort by stock ascending", async ({ page }) => {
    const home = homePage(page);
    await home.productTable.sort("stock");
    const rows = await home.productTable.rows();
    // "No" values should come before "Yes" when sorted ascending
    expect(rows[0].Stock).toBe("No");
    expect(rows[rows.length - 1].Stock).toBe("Yes");
  });

  test("sort by category ascending", async ({ page }) => {
    const home = homePage(page);
    await home.productTable.sort("category");
    const rows = await home.productTable.rows();
    const categories = rows.map((r: Record<string, string>) => r.Category);
    // Verify categories are in ascending alphabetical order
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });
});
