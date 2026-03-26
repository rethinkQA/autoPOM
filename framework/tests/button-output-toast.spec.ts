import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";

test.describe("Button, Output, and Toast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("add to cart shows confirmation in action output", async ({ page }) => {
    const home = homePage(page);
    await home.addToCart.click();
    const output = await home.actionOutput.read();
    expect(output).toContain("Added");
    expect(output).toContain("Wireless Mouse");
  });

  test("add to cart with quantity shows correct count", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(3);
    // Verify the quantity was actually set before clicking
    expect(await home.quantity.read()).toBe("3");
    await home.addToCart.click();
    expect(await home.actionOutput.read()).toContain("3x");
  });

  test("button text is 'Add to Cart'", async ({ page }) => {
    const home = homePage(page);
    expect(await home.addToCart.read()).toBe("Add to Cart");
  });

  test("button is not disabled", async ({ page }) => {
    const home = homePage(page);
    expect(await home.addToCart.isDisabled()).toBe(false);
  });

  test("group.click() triggers add to cart via root group", async ({ page }) => {
    const home = homePage(page);
    await home.click("Add to Cart");
    await home.toast.waitForVisible();
    expect(await home.toast.read()).toContain("Wireless Mouse");
  });

  test("withTimeout() returns a functional rebuilt element", async ({ page }) => {
    const home = homePage(page);
    const fast = home.addToCart.withTimeout(500);
    expect(await fast.read()).toBe("Add to Cart");
  });

  test("toast appears after add to cart", async ({ page }) => {
    const home = homePage(page);
    await home.addToCart.click();
    await home.toast.waitForVisible();
    expect(await home.toast.isVisible()).toBe(true);
    expect(await home.toast.read()).toContain("Wireless Mouse");
  });

  test("toast auto-dismisses after ~3 seconds", async ({ page }) => {
    const home = homePage(page);
    await home.addToCart.click();
    await home.toast.waitForVisible();
    const start = Date.now();
    // P3-176: Verify toast is still visible after 1s (lower bound)
    await page.waitForTimeout(1000);
    expect(await home.toast.isVisible()).toBe(true);
    await home.toast.waitForHidden({ timeout: 6000 });
    const elapsed = Date.now() - start;
    expect(await home.toast.isVisible()).toBe(false);
    // Toast should auto-dismiss within ~3s (allow up to 4.5s for CI slack)
    expect(elapsed).toBeLessThan(4500);
  });
});
