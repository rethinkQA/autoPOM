import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Table — tableRow.refresh()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("refresh re-locates the row after sorting", async ({ page }) => {
    const home = homePage(page);

    // Find "Wireless Mouse" row in the default order
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    expect(await row.get("Price")).toBe("$29.99");
    expect(await row.get("Category")).toBe("Electronics");

    // Sort by name ascending — row position changes
    await home.productTable.sort("name");

    // Refresh the row — should re-run the criteria and re-locate it
    const refreshed = await row.refresh();
    // Verify identity: same unique product name confirms correct row
    expect(await refreshed.get("Name")).toBe("Wireless Mouse");
    expect(await refreshed.get("Price")).toBe("$29.99");
    expect(await refreshed.get("Category")).toBe("Electronics");
    expect(await refreshed.get("Stock")).toBe("Yes");
  });

  test("refresh works after filtering", async ({ page }) => {
    const home = homePage(page);

    const row = await home.productTable.findRow({ name: "Bluetooth Keyboard" });
    expect(await row.get("Price")).toBe("$49.99");

    // Apply a filter that still includes this row
    await home.filters.write("Category", "Electronics");

    // Refresh should find the row in the filtered table
    const refreshed = await row.refresh();
    expect(await refreshed.get("Price")).toBe("$49.99");
    expect(await refreshed.get("Name")).toBe("Bluetooth Keyboard");
  });

  test("refresh throws when row no longer matches after filter", async ({ page }) => {
    const home = homePage(page);

    // Find a Books row
    const row = await home.productTable.findRow({ name: "Cooking Basics" });
    expect(await row.get("Category")).toBe("Books");

    // Filter to Electronics only — "Cooking Basics" disappears
    await home.filters.write("Category", "Electronics");

    // Refresh should throw because the row is no longer visible
    await expect(row.refresh()).rejects.toThrow(/No row found matching criteria/);
  });
});
