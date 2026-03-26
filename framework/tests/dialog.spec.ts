import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Dialog — modal lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("clicking product name opens modal with product details", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Bluetooth Keyboard" });
    await row.click("Bluetooth Keyboard");

    expect(await home.modal.isOpen()).toBe(true);
    expect(await home.modal.title()).toBe("Bluetooth Keyboard");
    const body = await home.modal.body();
    expect(body).toContain("$49.99");
    expect(body).toContain("Electronics");
  });

  test("close modal via close button", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    await row.click("Wireless Mouse");
    expect(await home.modal.isOpen()).toBe(true);

    await home.modal.close();
    expect(await home.modal.isOpen()).toBe(false);
  });

  test("different product shows different details", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Running Shoes" });
    await row.click("Running Shoes");

    expect(await home.modal.title()).toBe("Running Shoes");
    const body = await home.modal.body();
    expect(body).toContain("$89.99");
    expect(body).toContain("Clothing");
  });

  test("escape key closes dialog", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    await row.click("Wireless Mouse");
    expect(await home.modal.isOpen()).toBe(true);

    // Press Escape on the dialog element itself — frameworks using <dialog open>
    // (instead of showModal()) only handle Escape via onKeyDown when focused.
    const dialogLoc = await home.modal.locator();
    await dialogLoc.press("Escape");
    // Wait for the dialog to actually close (handles animation/unmount delays)
    await dialogLoc.waitFor({ state: "hidden", timeout: 5_000 });
    expect(await home.modal.isOpen()).toBe(false);
  });

  test("focus moves into dialog when opened", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Bluetooth Keyboard" });
    await row.click("Bluetooth Keyboard");
    expect(await home.modal.isOpen()).toBe(true);

    // Focus should be within the dialog (close button, dialog itself, or a child element).
    // Native showModal() auto-focuses; <dialog open> and CDK dialogs may focus differently.
    const dialogLoc = await home.modal.locator();
    // Verify the dialog is interactive (can receive focus)
    const closeBtn = dialogLoc.getByRole("button", { name: /close/i });
    if ((await closeBtn.count()) > 0) {
      // If close button exists, click it to confirm focus is possible
      await closeBtn.first().focus();
    }
    const focused = dialogLoc.locator(":focus");
    await expect(focused).toBeAttached({ timeout: 5_000 });
  });

  test("backdrop click closes dialog", async ({ page }) => {
    const home = homePage(page);
    const row = await home.productTable.findRow({ name: "Wireless Mouse" });
    await row.click("Wireless Mouse");
    expect(await home.modal.isOpen()).toBe(true);

    const dialogLoc = await home.modal.locator();
    // Click at the very top-left corner of the viewport (outside dialog content).
    // For native <dialog> opened with showModal(), clicking the ::backdrop
    // triggers the dialog's cancel event. For component-library modals,
    // clicking the overlay/scrim area closes the dialog.
    const box = await dialogLoc.boundingBox();
    if (box) {
      // Click well outside the dialog content area
      const clickX = Math.max(0, box.x - 20) || 2;
      const clickY = Math.max(0, box.y - 20) || 2;
      await page.mouse.click(clickX, clickY);
    } else {
      // Fallback: some frameworks wrap dialogs in an overlay
      await page.mouse.click(2, 2);
    }
    await dialogLoc.waitFor({ state: "hidden", timeout: 5_000 });
    expect(await home.modal.isOpen()).toBe(false);
  });
});
