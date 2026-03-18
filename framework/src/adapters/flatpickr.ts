/**
 * DatePickerAdapter for `flatpickr` (used by svelte-app).
 *
 * Flatpickr attaches a `.flatpickr-calendar` popup to document.body.
 * The month is a `<select class="flatpickr-monthDropdown-months">` and
 * the year is `<input class="numInput cur-year">`.
 * Day cells are `<span class="flatpickr-day">` with aria-labels like
 * "February 20, 2026".
 *
 * Strategy: click the input to open flatpickr, navigate to the target month/year,
 * then click the day span by its aria-label.
 */
import type { Locator } from "@playwright/test";
import type { DatePickerAdapter } from "../elements/datePicker.js";
import type { ActionOptions } from "../handler-types.js";

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function buildAriaLabel(year: number, month: number, day: number, locale: string): string {
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Create a flatpickr date picker adapter.
 *
 * @param locale - Locale for aria-label matching (default: `"en-US"`).
 */
export function createFlatpickrAdapter(locale = "en-US"): DatePickerAdapter {
  return {
    async select(el: Locator, dateStr: string, options?: ActionOptions) {
      const { year, month, day } = parseDate(dateStr);
      const timeout = options?.timeout;
      const page = el.page();

    // Click the input to open flatpickr calendar
    await el.click({ timeout });

    // Wait for the flatpickr calendar to appear (it's appended to document.body)
    const calendar = page.locator(".flatpickr-calendar.open");
    await calendar.waitFor({ state: "visible", timeout });

    // Navigate to the correct month/year (supports forward and backward)
    const maxAttempts = 24;
    for (let i = 0; i < maxAttempts; i++) {
      const monthSelect = calendar.locator("select.flatpickr-monthDropdown-months");
      const yearInput = calendar.locator("input.cur-year");

      const displayedMonth = Number(await monthSelect.inputValue({ timeout })) + 1; // 0-based
      const displayedYear = Number(await yearInput.inputValue({ timeout }));

      if (displayedMonth === month && displayedYear === year) break;

      // Determine direction: go backward if target is before current
      const current = displayedYear * 12 + displayedMonth;
      const target = year * 12 + month;
      const arrow = target < current
        ? calendar.locator(".flatpickr-prev-month")
        : calendar.locator(".flatpickr-next-month");
      await arrow.click({ timeout });
      await page.waitForTimeout(50);
    }

    // Click the target day span using its aria-label
    const ariaLabel = buildAriaLabel(year, month, day, locale);
    const dayCell = calendar.locator(`span.flatpickr-day[aria-label="${ariaLabel}"]`);
    await dayCell.click({ timeout });
  },

  async read(el: Locator, options?: ActionOptions) {
    return el.inputValue({ timeout: options?.timeout });
  },
  };
}

/** Default flatpickr adapter using en-US locale. */
export const flatpickrAdapter: DatePickerAdapter = createFlatpickrAdapter();
