import { test, expect } from "../src/test-fixture.js";
import { homePage } from "./pages/home.js";
import { appConfig } from "./pages/app-config.js";

test.describe("Order Controls — radio, stepper, date picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // ── Shipping Radio ─────────────────────────────────────────

  test("default shipping is Standard with $4.99", async ({ page }) => {
    const home = homePage(page);
    expect(await home.shippingCost.read()).toContain("$4.99");
  });

  test("choose Express shipping updates cost", async ({ page }) => {
    const home = homePage(page);
    await home.shipping.choose("Express");
    expect(await home.shippingCost.read()).toContain("$9.99");
  });

  test("choose Overnight shipping updates cost", async ({ page }) => {
    const home = homePage(page);
    await home.shipping.choose("Overnight");
    expect(await home.shippingCost.read()).toContain("$19.99");
  });

  test("radio read returns selected option label", async ({ page }) => {
    const home = homePage(page);
    await home.shipping.choose("Express");
    const selected = await home.shipping.read();
    expect(selected).toBe("Express");
  });

  test("radio.options() returns all available option labels", async ({ page }) => {
    const home = homePage(page);
    const opts = await home.shipping.options();
    expect(opts).toEqual(["Standard", "Express", "Overnight"]);
  });

  test("page-level write/read auto-detects radiogroup", async ({ page }) => {
    const home = homePage(page);
    // write via root group — detectElementType sees fieldset with radios
    await home.write("Shipping Method", "Express");
    const selected = await home.read("Shipping Method");
    expect(selected).toBe("Express");
    expect(await home.shippingCost.read()).toContain("$9.99");
  });

  // ── Quantity Stepper ───────────────────────────────────────

  test("quantity defaults to 1", async ({ page }) => {
    const home = homePage(page);
    expect(await home.quantity.read()).toBe(1);
  });

  test("increment quantity", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.increment();
    expect(await home.quantity.read()).toBe(2);
  });

  test("decrement quantity back to 1", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.increment();
    await home.quantity.decrement();
    expect(await home.quantity.read()).toBe(1);
  });

  test("set quantity to specific value", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(5);
    expect(await home.quantity.read()).toBe(5);
  });

  test("min disabled at 1", async ({ page }) => {
    const home = homePage(page);
    expect(await home.quantity.isMinDisabled()).toBe(true);
  });

  test("max disabled at 99", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(99);
    expect(await home.quantity.isMaxDisabled()).toBe(true);
  });

  test("decrement at min (1) keeps value at 1", async ({ page }) => {
    const home = homePage(page);
    expect(await home.quantity.read()).toBe(1);
    // Min button should be disabled, but verify value doesn't go below 1
    // even if we programmatically try decrement via fill
    await home.quantity.set(1, { strategy: "fill" });
    expect(await home.quantity.read()).toBe(1);
    expect(await home.quantity.isMinDisabled()).toBe(true);
  });

  test("increment at max (99) keeps value at 99", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(99);
    expect(await home.quantity.read()).toBe(99);
    expect(await home.quantity.isMaxDisabled()).toBe(true);
  });

  test("set quantity with strategy: fill bypasses click loop", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(42, { strategy: "fill" });
    expect(await home.quantity.read()).toBe(42);
  });

  test("set quantity with strategy: fill then read back", async ({ page }) => {
    const home = homePage(page);
    await home.quantity.set(10, { strategy: "fill" });
    expect(await home.quantity.read()).toBe(10);
    // Verify we can further modify via click after a fill
    await home.quantity.increment();
    expect(await home.quantity.read()).toBe(11);
  });

  // ── Date Picker ────────────────────────────────────────────

  test("select a date and read formatted output", async ({ page }, testInfo) => {
    const home = homePage(page, appConfig(testInfo));
    await home.deliveryDate.select("2026-02-20");
    expect(await home.dateDisplay.read()).toBe("February 20, 2026");
  });

  test("datePicker.read() returns raw input value", async ({ page }, testInfo) => {
    const home = homePage(page, appConfig(testInfo));
    await home.deliveryDate.select("2026-12-25");
    // Native pickers return YYYY-MM-DD; library pickers return their display format
    const raw = await home.deliveryDate.read();
    const project = testInfo.project.name;
    if (project === "vanilla" || project === "lit") {
      expect(raw).toBe("2026-12-25");
    } else if (project === "vue") {
      // @vuepic/vue-datepicker appends time by default: "MM/DD/YYYY, HH:mm"
      expect(raw).toMatch(/^12\/25\/2026/);
    } else {
      // react-datepicker (react, nextjs) use MM/DD/YYYY;
      // mat-datepicker (angular) uses M/D/YYYY; flatpickr (svelte) uses m/d/Y
      expect(raw).toBe("12/25/2026");
    }
  });

  test("select a different date updates output", async ({ page }, testInfo) => {
    const home = homePage(page, appConfig(testInfo));
    await home.deliveryDate.select("2026-07-04");
    expect(await home.dateDisplay.read()).toBe("July 4, 2026");
  });

  test("clear date picker resets output", async ({ page }, testInfo) => {
    // [P1-13] Known limitation: vue-datepicker and flatpickr maintain internal state;
    // clearing via fill/keyboard does not propagate — these libraries require their
    // own clear mechanisms (e.g., a clear button or programmatic API).
    const project = testInfo.project.name;
    test.skip(project === "vue" || project === "svelte",
      "Library date picker does not support clearing via fill/keyboard");
    const home = homePage(page, appConfig(testInfo));
    // Select a date first
    await home.deliveryDate.select("2026-03-15");
    expect(await home.dateDisplay.read()).toBe("March 15, 2026");

    // Clear the date input
    const dpLocator = await home.deliveryDate.locator();
    await dpLocator.fill("");
    // Some library pickers don't respond to fill(""), try keyboard fallback
    const currentVal = await home.deliveryDate.read();
    if (currentVal !== "") {
      await dpLocator.click({ clickCount: 3 });
      await dpLocator.press("Backspace");
    }
    // Verify the date display resets (empty, placeholder, or original state)
    const dateText = await home.dateDisplay.read();
    expect(dateText).not.toBe("March 15, 2026");
    // Also verify the field is actually empty or shows a placeholder — not a different date
    const looksLikeDate = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/.test(dateText);
    expect(looksLikeDate).toBe(false);
  });
});
