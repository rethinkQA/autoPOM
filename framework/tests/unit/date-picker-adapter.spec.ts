import { test, expect } from "../../src/test-fixture.js";
import { datePicker } from "../../src/elements/datePicker.js";
import { By } from "../../src/by.js";
import type { DatePickerAdapter } from "../../src/elements/datePicker.js";

/**
 * Unit tests for custom DatePickerAdapter injection.
 *
 * Verifies that datePicker() delegates select() and read() calls to the
 * provided adapter, passing the correct arguments (locator, value/options).
 */
test.describe("datePicker custom adapter", () => {
  test("select() delegates to custom adapter with correct arguments", async ({ page }) => {
    await page.setContent(`<input id="dp" type="date" />`);

    const calls: Array<{ method: string; dateStr?: string }> = [];
    const mockAdapter: DatePickerAdapter = {
      async select(_el, dateStr) {
        calls.push({ method: "select", dateStr });
      },
      async read() {
        return "";
      },
    };

    const dp = datePicker(By.css("#dp"), page, { adapter: mockAdapter });
    await dp.select("2026-03-06");

    expect(calls).toEqual([{ method: "select", dateStr: "2026-03-06" }]);
  });

  test("read() delegates to custom adapter and returns its value", async ({ page }) => {
    await page.setContent(`<input id="dp" type="date" />`);

    const mockAdapter: DatePickerAdapter = {
      async select() {},
      async read() {
        return "2026-01-15";
      },
    };

    const dp = datePicker(By.css("#dp"), page, { adapter: mockAdapter });
    const value = await dp.read();

    expect(value).toBe("2026-01-15");
  });

  test("adapter receives the resolved locator element", async ({ page }) => {
    await page.setContent(`<input id="dp" type="date" value="2026-06-01" />`);

    let receivedLocator = false;
    const mockAdapter: DatePickerAdapter = {
      async select(el) {
        // Verify we received a real Playwright locator by calling a method on it
        const tag = await el.evaluate((node) => node.tagName.toLowerCase());
        receivedLocator = tag === "input";
      },
      async read(el) {
        const val = await el.inputValue();
        return val;
      },
    };

    const dp = datePicker(By.css("#dp"), page, { adapter: mockAdapter });
    await dp.select("2026-12-25");
    expect(receivedLocator).toBe(true);

    // read() should also receive a working locator
    const value = await dp.read();
    expect(value).toBe("2026-06-01");
  });

  test("default adapter is used when no custom adapter is provided", async ({ page }) => {
    await page.setContent(`<input id="dp" type="date" />`);

    // No adapter option — falls back to nativeDatePickerAdapter
    const dp = datePicker(By.css("#dp"), page);
    await dp.select("2026-07-04");

    const value = await dp.read();
    expect(value).toBe("2026-07-04");
  });
});
