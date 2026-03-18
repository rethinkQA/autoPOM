import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Table — findRow scoped access", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("findRow by name and read cell values", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    expect(await row.get("Price")).toBe("$29.99");
    expect(await row.get("Category")).toBe("Electronics");
    expect(await row.get("Stock")).toBe("Yes");
  });

  test("findRow by name and click Add to Cart in row", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    await row.click("Add to Cart");
    await home.toast.waitForVisible();
    expect(await home.toast.read()).toContain("Wireless Mouse");
  });

  test("findRow by name and click product name to open modal", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Bluetooth Keyboard" });
    await row.click("Bluetooth Keyboard");
    expect(await home.modal.isOpen()).toBe(true);
    expect(await home.modal.title()).toBe("Bluetooth Keyboard");
  });

  test("findRow with multiple criteria", async ({ page }) => {
    const home = homePage(page);
    // Find first book that's in stock
    const row = await home.productTable.findRow({ category: "Books", stock: "Yes" });
    const name = await row.get("Name");
    // Should be either "Cooking Basics" or "Science Fiction Novel"
    expect(["Cooking Basics", "Science Fiction Novel"]).toContain(name);
  });

  test("findRow for non-existent product throws", async ({ page }) => {
    const home = homePage(page);
    await expect(
      home.productTable.findRow({ name: "Nonexistent Product" }),
    ).rejects.toThrow("No row found matching criteria");
  });

  test("findRow with invalid column throws", async ({ page }) => {
    const home = homePage(page);
    await expect(
      home.productTable.findRow({ bogus: "value" }),
    ).rejects.toThrow('Column "bogus" not found');
  });

  test("findRow on out-of-stock product", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "USB-C Hub" });
    expect(await row.get("Stock")).toBe("No");
    expect(await row.get("Price")).toBe("$39.99");
  });
});
