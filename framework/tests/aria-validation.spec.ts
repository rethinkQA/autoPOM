import { test, expect } from "../src/test-fixture.js";

test.describe("ARIA attribute validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("toast container has aria-live attribute", async ({ page }) => {
    const toast = page.locator(".toast[aria-live]");
    // Trigger toast by adding to cart
    await page.locator("button >> text=Add to Cart").first().click();
    await toast.waitFor({ state: "visible", timeout: 5000 });
    const ariaLive = await toast.getAttribute("aria-live");
    expect(ariaLive).toBe("polite");
    // Functional check: verify the toast region contains updated content
    // (aria-live="polite" is only useful if the region actually updates)
    const text = await toast.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test("dialog has role='dialog' when open", async ({ page }) => {
    // Open modal by clicking a product name
    await page.locator("table >> text=Bluetooth Keyboard").first().click();
    const dialog = page.locator("[role='dialog'], dialog");
    await dialog.first().waitFor({ state: "visible", timeout: 5000 });
    // Verify it has an accessible role
    const role = await dialog.first().evaluate(
      (el) => el.getAttribute("role") || el.tagName.toLowerCase(),
    );
    expect(["dialog"]).toContain(role);
  });

  test("dialog has accessible title when open", async ({ page }) => {
    await page.locator("table >> text=Bluetooth Keyboard").first().click();
    const dialog = page.locator("[role='dialog'], dialog");
    await dialog.first().waitFor({ state: "visible", timeout: 5000 });
    // Dialog should have aria-label or aria-labelledby for screen readers
    const hasLabel = await dialog.first().evaluate((el) => {
      return !!(
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.querySelector("h1, h2, h3, [id]")?.matches("h1, h2, h3")
      );
    });
    expect(hasLabel).toBe(true);
  });

  test("product table has role='table' or is a <table>", async ({ page }) => {
    const table = page.locator("table, [role='table']").first();
    await expect(table).toBeVisible();
    const tagOrRole = await table.evaluate(
      (el) => el.getAttribute("role") || el.tagName.toLowerCase(),
    );
    expect(["table"]).toContain(tagOrRole);
  });

  test("add to cart button has accessible name", async ({ page }) => {
    const button = page.getByRole("button", { name: "Add to Cart" });
    await expect(button.first()).toBeVisible();
    // Verify button has discernible text
    const text = await button.first().textContent();
    expect(text?.trim()).toBeTruthy();
  });

  test("search input has associated label", async ({ page }) => {
    // The search input should be findable by its label for accessibility
    const input = page.getByLabel("Search Products");
    await expect(input).toBeVisible();
    // Functional check: verify the label association actually resolves to an input
    const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
    expect(["input", "textarea"]).toContain(tagName);
  });

  test("radio group has accessible group role", async ({ page }) => {
    const radioGroup = page.locator("[role='group'], [role='radiogroup'], fieldset").filter({
      hasText: /shipping/i,
    });
    await expect(radioGroup.first()).toBeAttached();
  });

  test("checkbox toggle updates aria-checked", async ({ page }) => {
    const checkbox = page.locator(
      "input[type='checkbox'], [role='checkbox'], [role='switch']",
    ).first();
    // Skip if no checkbox exists on this app's home page
    const count = await checkbox.count();
    test.skip(count === 0, "No checkbox found on this app's home page");

    const before = await checkbox.evaluate((el) => {
      if (el.tagName === "INPUT") return (el as HTMLInputElement).checked;
      return el.getAttribute("aria-checked");
    });
    await checkbox.click();
    const after = await checkbox.evaluate((el) => {
      if (el.tagName === "INPUT") return (el as HTMLInputElement).checked;
      return el.getAttribute("aria-checked");
    });
    expect(after).not.toBe(before);
  });
});
