/**
 * DatePickerAdapter for Angular Material `mat-datepicker`.
 *
 * MatDatepicker renders inside `<mat-form-field>` with a toggle button
 * that opens a CDK overlay calendar. The header shows "MAR 2026" in the
 * period button. Day cells are `<button>` elements with aria-labels
 * like "February 20, 2026".
 *
 * Strategy: click the toggle to open the calendar overlay, navigate to
 * the target month/year, then click the day cell by aria-label.
 */
import type { Locator } from "@playwright/test";
import type { DatePickerAdapter } from "../elements/datePicker.js";
import type { ActionOptions } from "../handler-types.js";
import { DIALOG_CLOSE_TIMEOUT_MS } from "../timeouts.js";
import { isRetryableInteractionError } from "../playwright-errors.js";

function parseDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function shortMonthUpper(month: number, locale: string): string {
  return new Date(2000, month - 1, 1)
    .toLocaleString(locale, { month: "short" })
    .toUpperCase(); // "FEB", "MAR", etc.
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
 * Create a Material datepicker adapter.
 *
 * @param locale - Locale for month name matching and aria-label generation (default: `"en-US"`).
 */
export function createMatDatePickerAdapter(locale = "en-US"): DatePickerAdapter {
  return {
  async select(el: Locator, dateStr: string, options?: ActionOptions) {
    const { year, month, day } = parseDate(dateStr);
    const timeout = options?.timeout;
    const page = el.page();

    // Click the calendar toggle button to open the overlay
    const formField = el.locator("xpath=ancestor::mat-form-field");
    const toggle = formField.locator("mat-datepicker-toggle button");
    await toggle.click({ timeout });

    // Wait for the CDK overlay calendar to appear
    const overlay = page.locator(".cdk-overlay-container mat-datepicker-content");
    await overlay.waitFor({ state: "visible", timeout });

    // Navigate to the correct month/year (supports forward and backward)
    // Period button text looks like "MAR 2026"
    const targetMonth = shortMonthUpper(month, locale); // "FEB"
    const maxAttempts = 24;
    for (let i = 0; i < maxAttempts; i++) {
      const periodBtn = overlay.locator(".mat-calendar-period-button");
      const headerText = (await periodBtn.textContent({ timeout }))?.trim() ?? "";

      if (headerText.includes(targetMonth) && headerText.includes(String(year))) {
        break;
      }

      // Parse displayed month/year to determine direction
      const match = headerText.match(/([A-Z]{3})\s+(\d{4})/);
      if (match) {
        const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        const dispM = months.indexOf(match[1]) + 1;
        const dispY = Number(match[2]);
        const current = dispY * 12 + dispM;
        const target = year * 12 + month;
        const btnSel = target < current
          ? ".mat-calendar-previous-button"
          : ".mat-calendar-next-button";
        await overlay.locator(btnSel).click({ timeout });
      } else {
        await overlay.locator(".mat-calendar-next-button").click({ timeout });
      }
      await page.waitForTimeout(50);
    }

    // Click the target day cell by its aria-label
    const ariaLabel = buildAriaLabel(year, month, day, locale);
    const dayCell = overlay.locator(`button.mat-calendar-body-cell[aria-label="${ariaLabel}"]`);
    await dayCell.click({ timeout });

    // Wait for the calendar overlay to close (CDK animations).
    // This prevents ambiguity for subsequent getByLabel() calls.
    // Only swallow retryable interaction errors (e.g. timeout waiting
    // for the overlay to hide); re-throw unexpected failures (#162).
    await overlay.waitFor({ state: "hidden", timeout: DIALOG_CLOSE_TIMEOUT_MS }).catch((e: unknown) => {
      if (!isRetryableInteractionError(e)) throw e;
    });
  },

  async read(el: Locator, options?: ActionOptions) {
    return el.inputValue({ timeout: options?.timeout });
  },
  };
}

/** Default Material datepicker adapter using en-US locale. */
export const matDatePickerAdapter: DatePickerAdapter = createMatDatePickerAdapter();
