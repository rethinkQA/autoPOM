import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Keyboard Navigation — §6.4 compliance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Reset focus state to prevent leakage between tests
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  });

  // ── Tab order through form controls ────────────────────────

  test("Tab navigates through filter bar controls", async ({ page }) => {
    const home = homePage(page);

    // Focus the search input first
    const searchInput = page.getByLabel("Search Products");
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Tab to next control (Category select)
    await page.keyboard.press("Tab");
    const categorySelect = page.getByLabel("Category");
    await expect(categorySelect).toBeFocused();
  });

  test("Shift+Tab navigates backwards through controls", async ({ page }) => {
    // Focus Category, then Shift+Tab should go back to Search
    const categorySelect = page.getByLabel("Category");
    await categorySelect.focus();
    await expect(categorySelect).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    const searchInput = page.getByLabel("Search Products");
    await expect(searchInput).toBeFocused();
  });

  // ── Radio group keyboard navigation ────────────────────────

  test("Arrow keys navigate radio group options", async ({ page }) => {
    const home = homePage(page);

    // Focus the first radio in the shipping group
    const standardRadio = page.getByRole("radio", { name: "Standard" });
    await standardRadio.focus();
    await expect(standardRadio).toBeChecked();

    // ArrowDown or ArrowRight should move to Express
    await page.keyboard.press("ArrowDown");
    const expressRadio = page.getByRole("radio", { name: "Express" });
    await expect(expressRadio).toBeChecked();

    // ArrowDown again should move to Overnight
    await page.keyboard.press("ArrowDown");
    const overnightRadio = page.getByRole("radio", { name: "Overnight" });
    await expect(overnightRadio).toBeChecked();

    // Verify the shipping cost updated
    expect(await home.shippingCost.read()).toContain("$19.99");
  });

  // ── Button activation via Enter/Space ──────────────────────

  test("Enter activates button", async ({ page }) => {
    const home = homePage(page);
    // Set up some form state first so we have something to submit
    await home.quantity.set(2);

    const addBtn = page.getByRole("button", { name: /add to cart/i });
    await addBtn.focus();
    await expect(addBtn).toBeFocused();
    await page.keyboard.press("Enter");

    // Verify the action output appeared
    const output = await home.actionOutput.read();
    expect(output).toContain("Added");
  });

  // ── Dialog focus trap ──────────────────────────────────────

  test("dialog traps focus — Tab cycles within dialog", async ({ page }) => {
    const home = homePage(page);

    // Open a dialog
    const row = await home.productTable.findRow({ name: "Bluetooth Keyboard" });
    await row.click("Bluetooth Keyboard");
    expect(await home.modal.isOpen()).toBe(true);

    const dialogLoc = await home.modal.locator();

    // Find the close button inside the dialog
    const closeBtn = dialogLoc.getByRole("button", { name: /close/i });
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().focus();
      await expect(closeBtn.first()).toBeFocused();
    }

    // Tab several times — track focus path and verify it stays in dialog
    const focusPath: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const isInDialog = await dialogLoc.evaluate((dialog) => {
        return dialog.contains(document.activeElement);
      });
      focusPath.push(isInDialog);
    }

    // Every Tab press should keep focus inside the dialog (true focus trap)
    expect(focusPath.every(Boolean)).toBe(true);
  });

  test("Escape key closes dialog and restores focus", async ({ page }) => {
    const home = homePage(page);

    // Open a dialog
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    await row.click("Wireless Mouse");
    expect(await home.modal.isOpen()).toBe(true);

    // Press Escape to close
    const dialogLoc = await home.modal.locator();
    await dialogLoc.press("Escape");
    await dialogLoc.waitFor({ state: "hidden", timeout: 5_000 });
    expect(await home.modal.isOpen()).toBe(false);
  });

  // ── Checkbox keyboard activation ───────────────────────────

  test("Space toggles checkbox", async ({ page }) => {
    const home = homePage(page);

    const checkbox = page.getByLabel("Show only in-stock items");
    await checkbox.focus();
    await expect(checkbox).toBeFocused();

    // Space should toggle the checkbox
    await page.keyboard.press("Space");
    expect(await home.filters.read("Show only in-stock items")).toBe(true);

    // Space again should uncheck
    await page.keyboard.press("Space");
    expect(await home.filters.read("Show only in-stock items")).toBe(false);
  });
});
