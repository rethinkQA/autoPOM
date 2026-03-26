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
import { cssEscape } from "../dom-helpers.js";

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(
      `Invalid date string "${dateStr}": expected format YYYY-MM-DD with month 1–12 and day 1–31.`,
    );
  }
  // Validate the date actually exists (e.g. reject Feb 31)
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(
      `Invalid date "${dateStr}": ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} does not exist.`,
    );
  }
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

      if (Number.isNaN(displayedMonth) || Number.isNaN(displayedYear)) {
        throw new Error(
          `flatpickr: month select or year input returned non-numeric value`,
        );
      }

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

    // Throw if navigation failed — prevents selecting a day in the wrong month.
    {
      const finalMonth = Number(await calendar.locator("select.flatpickr-monthDropdown-months").inputValue({ timeout })) + 1;
      const finalYear = Number(await calendar.locator("input.cur-year").inputValue({ timeout }));
      if (finalMonth !== month || finalYear !== year) {
        throw new Error(
          `flatpickr: failed to navigate to ${year}-${String(month).padStart(2, "0")} after ${maxAttempts} attempts (stuck on ${finalYear}-${String(finalMonth).padStart(2, "0")})`,
        );
      }
    }

    // Click the target day span using its aria-label
    const ariaLabel = buildAriaLabel(year, month, day, locale);
    const dayCell = calendar.locator(`span.flatpickr-day[aria-label="${cssEscape(ariaLabel)}"]`);
    await dayCell.click({ timeout });

    // Wait for the calendar to close after day selection (P2-184).
    await calendar.waitFor({ state: "hidden", timeout }).catch(() => {});
  },

  async read(el: Locator, options?: ActionOptions) {
    return el.inputValue({ timeout: options?.timeout });
  },
  };
}

/** Default flatpickr adapter using en-US locale. */
export const flatpickrAdapter: DatePickerAdapter = createFlatpickrAdapter();
