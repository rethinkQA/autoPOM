import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("group.readTyped() — typed value reading", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("readTyped('string') returns a string for a text input", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Search Products", "mouse");
    const value = await home.filters.readTyped("Search Products", "string");
    expect(value).toBe("mouse");
    expect(typeof value).toBe("string");
  });

  test("readTyped('boolean') returns a boolean for a checkbox", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Show only in-stock items", true);
    const value = await home.filters.readTyped("Show only in-stock items", "boolean");
    expect(value).toBe(true);
    expect(typeof value).toBe("boolean");
  });

  test("readTyped throws TypeError on kind mismatch (checkbox as string)", async ({ page }) => {
    const home = homePage(page);
    // The checkbox handler has valueKind: "boolean", requesting "string" should throw.
    await expect(
      home.filters.readTyped("Show only in-stock items", "string"),
    ).rejects.toThrow(TypeError);
  });

  test("readTyped('string') for a select dropdown returns the selected option", async ({ page }) => {
    const home = homePage(page);
    await home.filters.write("Category", "Books");
    const value = await home.filters.readTyped("Category", "string");
    expect(value).toBe("Books");
  });
});
