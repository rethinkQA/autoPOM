/**
 * DatePickerAdapter for `@vuepic/vue-datepicker` (used by vue-app).
 *
 * VueDatePicker renders a custom input (class `dp__input`). Clicking it
 * opens a calendar popup (`.dp__menu`). With `auto-apply` on, clicking a
 * day cell immediately selects the date (no confirm button).
 *
 * The header shows separate buttons for month ("Mar") and year ("2026")
 * with `data-dp-element="overlay-month"` and `data-dp-element="overlay-year"`.
 * Navigation arrows have `aria-label="Previous month"` and `"Next month"`.
 *
 * Day cells: `.dp__cell_inner` with text content of the day number.
 *
 * Strategy: click input → open popup → navigate month/year → click day.
 */
import type { Locator } from "@playwright/test";
import type { DatePickerAdapter } from "../elements/datePicker.js";
import type { ActionOptions } from "../handler-types.js";

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

/**
 * Build a map of localized short month names to 1-based month indices.
 *
 * Example (en-US): `{ "Jan": 1, "Feb": 2, … }`
 */
function buildMonthMap(locale: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (let m = 0; m < 12; m++) {
    const name = new Date(2000, m, 1).toLocaleString(locale, { month: "short" });
    map[name] = m + 1;
  }
  return map;
}

function shortMonthName(month: number, locale: string): string {
  return new Date(2000, month - 1, 1).toLocaleString(locale, { month: "short" });
}

/**
 * Create a VueDatePicker adapter.
 *
 * @param locale - Locale for month name parsing (default: `"en-US"`).
 */
export function createVueDatePickerAdapter(locale = "en-US"): DatePickerAdapter {
  const monthMap = buildMonthMap(locale);

  return {
    async select(el: Locator, dateStr: string, options?: ActionOptions) {
      const { year, month, day } = parseDate(dateStr);
      const timeout = options?.timeout;
      const page = el.page();

      // Click the input to open the calendar popup
      await el.click({ timeout });

      // Wait for the menu to appear
      const menu = page.locator(".dp__menu");
      await menu.waitFor({ state: "visible", timeout });

      // Navigate to the correct month/year (supports forward and backward)
      const targetShort = shortMonthName(month, locale); // e.g. "Feb"
      const maxAttempts = 24;
      for (let i = 0; i < maxAttempts; i++) {
        const monthBtn = menu.locator('[data-dp-element="overlay-month"]');
        const yearBtn = menu.locator('[data-dp-element="overlay-year"]');
        const displayedMonth = (await monthBtn.textContent({ timeout }))?.trim();
        const displayedYear = (await yearBtn.textContent({ timeout }))?.trim();

        if (displayedMonth === targetShort && displayedYear === String(year)) break;

        // Parse displayed month using locale-aware map instead of Date.parse
        const dispMonthIndex = monthMap[displayedMonth ?? ""] ?? 0;
        const dispYearNum = Number(displayedYear);

        if (dispMonthIndex === 0 || isNaN(dispYearNum)) {
          // Cannot parse — fall back to clicking next
          await menu.locator('[aria-label="Next month"]').click({ timeout });
          await page.waitForTimeout(100);
          continue;
        }

        const current = dispYearNum * 12 + dispMonthIndex;
        const target = year * 12 + month;
        const arrow = target < current
          ? menu.locator('[aria-label="Previous month"]')
          : menu.locator('[aria-label="Next month"]');
        await arrow.click({ timeout });
        await page.waitForTimeout(100);
      }

      // Click the target day cell
      const dayCell = menu.locator(
        `.dp__calendar_item .dp__cell_inner:not(.dp__cell_offset)`
      ).filter({ hasText: new RegExp(`^${day}$`) });
      await dayCell.first().click({ timeout });
    },

    async read(el: Locator, options?: ActionOptions) {
      return el.inputValue({ timeout: options?.timeout });
    },
  };
}

/** Default VueDatePicker adapter using en-US locale. */
export const vueDatePickerAdapter: DatePickerAdapter = createVueDatePickerAdapter();
