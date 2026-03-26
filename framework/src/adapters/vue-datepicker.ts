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

/**
 * Build a map of localized short month names to 1-based month indices
 * inside the browser context, ensuring the month strings match what
 * the date picker actually renders (P2-173).
 */
async function buildMonthMapInBrowser(page: import("@playwright/test").Page, locale: string): Promise<Record<string, number>> {
  return page.evaluate((loc) => {
    const map: Record<string, number> = {};
    for (let m = 0; m < 12; m++) {
      const name = new Date(2000, m, 1).toLocaleString(loc, { month: "short" });
      map[name] = m + 1;
    }
    return map;
  }, locale);
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
  // P2-173: Month map is built lazily in the browser context on first use
  // to ensure month strings match what the date picker renders.
  let cachedMonthMap: Record<string, number> | null = null;

  return {
    async select(el: Locator, dateStr: string, options?: ActionOptions) {
      const { year, month, day } = parseDate(dateStr);
      const timeout = options?.timeout;
      const page = el.page();

      // Build month map in browser context on first use (P2-173)
      if (!cachedMonthMap) {
        cachedMonthMap = await buildMonthMapInBrowser(page, locale);
      }
      const monthMap = cachedMonthMap;

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
          await menu.locator('[data-dp-element="overlay-month"]').waitFor({ state: "attached", timeout });
          continue;
        }

        const current = dispYearNum * 12 + dispMonthIndex;
        const target = year * 12 + month;
        const arrow = target < current
          ? menu.locator('[aria-label="Previous month"]')
          : menu.locator('[aria-label="Next month"]');
        await arrow.click({ timeout });
        await menu.locator('[data-dp-element="overlay-month"]').waitFor({ state: "attached", timeout });
      }

      // Throw if navigation failed — prevents selecting a day in the wrong month.
      {
        const finalMonth = (await menu.locator('[data-dp-element="overlay-month"]').textContent({ timeout }))?.trim();
        const finalYear = (await menu.locator('[data-dp-element="overlay-year"]').textContent({ timeout }))?.trim();
        if (finalMonth !== targetShort || finalYear !== String(year)) {
          throw new Error(
            `vue-datepicker: failed to navigate to ${targetShort} ${year} after ${maxAttempts} attempts (stuck on "${finalMonth} ${finalYear}")`,
          );
        }
      }

      // Click the target day cell
      const dayCell = menu.locator(
        `.dp__calendar_item .dp__cell_inner:not(.dp__cell_offset)`
      ).filter({ hasText: new RegExp(`^${day}$`) });
      await dayCell.first().click({ timeout });

      // Wait for the calendar popup to close after day selection (P2-185).
      await menu.waitFor({ state: "hidden", timeout }).catch(() => {});
    },

    async read(el: Locator, options?: ActionOptions) {
      return el.inputValue({ timeout: options?.timeout });
    },
  };
}

/** Default VueDatePicker adapter using en-US locale. */
export const vueDatePickerAdapter: DatePickerAdapter = createVueDatePickerAdapter();
