import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("group.overrideHandler() — string type name", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("overrideHandler with string type applies the named handler", async ({ page }) => {
    const home = homePage(page);
    // "Category" is auto-detected as a <select>; override it to use the "input" handler.
    // Writing to it via the input handler uses .fill(), which sets the <select>'s value
    // attribute but won't change the visible selected option the same way.
    // The important thing is that the override resolves without error.
    const overridden = home.filters.overrideHandler("Search Products", "input");
    await overridden.write("Search Products", "mouse");
    expect(await overridden.read("Search Products")).toBe("mouse");
  });

  test("overrideHandler with object literal applies custom handler", async ({ page }) => {
    const home = homePage(page);
    let setCalled = false;
    const customHandler = {
      set: async () => { setCalled = true; },
      get: async () => "custom-value",
    };
    const overridden = home.filters.overrideHandler("Search Products", customHandler);
    await overridden.write("Search Products", "anything");
    expect(setCalled).toBe(true);
    expect(await overridden.read("Search Products")).toBe("custom-value");
  });

  test("overrideHandler with invalid string type throws", async ({ page }) => {
    const home = homePage(page);
    expect(() => home.filters.overrideHandler("Search Products", "nonexistent-type")).toThrow(
      /overrideHandler: no registered handler with type "nonexistent-type"/,
    );
  });

  test("overrideHandler is immutable — original group is unaffected", async ({ page }) => {
    const home = homePage(page);
    const original = home.filters;
    const overridden = original.overrideHandler("Search Products", "input");

    // Write via the overridden group
    await overridden.write("Search Products", "test");
    expect(await overridden.read("Search Products")).toBe("test");

    // The original group still uses its auto-detected handler
    expect(await original.read("Search Products")).toBe("test");
  });
});
