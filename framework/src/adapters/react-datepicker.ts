/**
 * DatePickerAdapter for `react-datepicker` (used by react-app and nextjs-app).
 *
 * react-datepicker renders a text `<input>` with dateFormat="MM/dd/yyyy".
 * Clearing and typing a date string in that format triggers the onChange callback.
 */
import type { Locator } from "@playwright/test";
import type { DatePickerAdapter } from "../elements/datePicker.js";
import type { ActionOptions } from "../handler-types.js";

/**
 * Convert YYYY-MM-DD → MM/dd/yyyy for react-datepicker's text input.
 */
function toReactFormat(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

export const reactDatePickerAdapter: DatePickerAdapter = {
  async select(el: Locator, dateStr: string, options?: ActionOptions) {
    const formatted = toReactFormat(dateStr);
    // Clear then type the formatted date — react-datepicker parses typed input.
    await el.click({ timeout: options?.timeout });
    await el.fill("", { timeout: options?.timeout });
    await el.pressSequentially(formatted, { delay: 30, timeout: options?.timeout });
    // Press Enter to confirm the date and close the popup.
    await el.press("Enter", { timeout: options?.timeout });
  },
  async read(el: Locator, options?: ActionOptions) {
    return el.inputValue({ timeout: options?.timeout });
  },
};
