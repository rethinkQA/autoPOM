import { test, expect } from "../src/test-fixture.js";
import { By, group } from "../src/index.js";

test.describe("group.find() — container narrowing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.afterEach(async ({ page }) => {
    // Clean up any injected elements to prevent cross-test interference
    await page.evaluate(() => {
      document.querySelectorAll(".filter-group [data-injected]").forEach((el) => el.remove());
    });
  });

  test("find() narrows to the container matching the given text", async ({ page }) => {
    // The page has three .filter-group divs, each containing a different label.
    // Use find() to narrow to the one containing "Category".
    const filters = group(By.css(".filter-group"), page);
    const categoryGroup = await filters.find("Category");
    // The narrowed group should be scoped to the filter-group containing the Category select
    await categoryGroup.write("Category", "Books");
    expect(await categoryGroup.read("Category")).toBe("Books");
  });

  test("find() throws ElementNotFoundError when no container matches", async ({ page }) => {
    const filters = group(By.css(".filter-group"), page);
    await expect(filters.find("Nonexistent Filter")).rejects.toThrow(
      /group\.find\(\): No container matched text "Nonexistent Filter"/,
    );
  });

  test("find() throws AmbiguousMatchError when multiple containers match", async ({ page }) => {
    // Inject duplicate text so multiple .filter-group divs match the same text
    // Use Playwright locator to find filter-groups (pierces shadow DOM for Lit)
    const groups = page.locator(".filter-group");
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
      await groups.nth(i).evaluate((fg) => {
        const span = document.createElement("span");
        span.textContent = "Shared Label";
        span.setAttribute("data-injected", "true");
        fg.appendChild(span);
      });
    }
    const filters = group(By.css(".filter-group"), page);
    await expect(filters.find("Shared Label")).rejects.toThrow(
      /group\.find\(\): Ambiguous match/,
    );
  });
});
