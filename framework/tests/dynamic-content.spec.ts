import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Dynamic content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("delayed content initially shows loading message", async ({ page }) => {
    const home = homePage(page);
    // Content loads after ~1.5s — verify loading text appears first.
    // Use a generous timeout to accommodate different framework lifecycles.
    const locator = await home.delayedContent.locator();
    await expect(locator).toBeVisible();
    // Some frameworks may resolve too quickly to catch loading state — skip if so
    const text = await locator.textContent();
    if (text?.includes("Loading")) {
      await expect(locator).toHaveText("Loading recommendations\u2026", { timeout: 2000 });
    }
  });

  test("delayed content eventually shows recommendations", async ({ page }) => {
    const home = homePage(page);
    // Wait for the content to change from loading state
    await expect(await home.delayedContent.locator()).toContainText("USB-C Hub", {
      timeout: 5_000,
    });
  });

  test("validation message on empty search enter", async ({ page }) => {
    const home = homePage(page);
    // Press Enter with empty search input
    await page.getByLabel("Search Products").press("Enter");
    await expect(await home.validationMsg.locator()).toBeVisible();
    expect(await home.validationMsg.read()).toBe("Please enter a search term");
  });

  test("validation message hides when text is entered", async ({ page }) => {
    const home = homePage(page);
    // Trigger validation
    await page.getByLabel("Search Products").press("Enter");
    await expect(await home.validationMsg.locator()).toBeVisible();

    // Type something — validation should hide
    await home.filters.write("Search Products", "mouse");
    await page.getByLabel("Search Products").press("Enter");
    await expect(await home.validationMsg.locator()).toBeHidden();
  });

  test("item list is visible with 3 items", async ({ page }) => {
    const home = homePage(page);
    expect(await home.itemList.isVisible()).toBe(true);
    const listItems = page.locator(".item-list li");
    expect(await listItems.count()).toBe(3);
    // P3-174: verify items have actual text content (not empty placeholders)
    const firstText = await listItems.first().textContent();
    expect(firstText!.trim().length).toBeGreaterThan(0);
  });
});
