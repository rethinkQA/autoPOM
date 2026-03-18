import { By, type Scope } from "../by.js";
import type { Locator } from "@playwright/test";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { type BaseElement, buildElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/**
 * Adapter interface for technology-specific date picker interactions.
 * Implement this to support non-native date picker libraries
 * (react-datepicker, mat-datepicker, flatpickr, etc.).
 */
export interface DatePickerAdapter {
  /** Interact with the date picker to select the given date (YYYY-MM-DD format). */
  select(el: Locator, dateStr: string, options?: ActionOptions): Promise<void>;
  /** Read the currently selected date value from the picker. */
  read(el: Locator, options?: ActionOptions): Promise<string>;
}

/** Default adapter for native <input type="date"> — fills the value directly. */
export const nativeDatePickerAdapter: DatePickerAdapter = {
  async select(el, dateStr, options) {
    await el.fill(dateStr, { timeout: options?.timeout });
  },
  async read(el, options) {
    return el.inputValue({ timeout: options?.timeout });
  },
};

export interface DatePickerElement extends BaseElement<DatePickerElement> {
  select(dateStr: string, options?: ActionOptions): Promise<void>;
  read(options?: ActionOptions): Promise<string>;
}

export interface DatePickerOptions extends ElementOptions {
  /** Override the default native date picker adapter. */
  adapter?: DatePickerAdapter;
}

/**
 * Date picker wrapper.
 *
 * Uses the native <input type="date"> adapter by default.
 * Pass a custom adapter for framework-specific date pickers:
 *
 * ```ts
 * const dp = datePicker(By.label("Date"), page, { adapter: reactDatePickerAdapter });
 * ```
 */
export function datePicker(
  by: By,
  scope: Scope,
  options?: DatePickerOptions,
): DatePickerElement {
  const { loc, t, base, ctx, meta } = buildElement<DatePickerElement>(by, scope, options,
    (ms) => datePicker(by, scope, { ...options, timeout: ms }));
  const adapter = options?.adapter ?? nativeDatePickerAdapter;

  return wrapElement("datePicker", {
    ...base,
    async select(dateStr: string, opts?: ActionOptions) {
      await adapter.select(await loc(), dateStr, { timeout: t(opts) });
    },
    async read(opts?: ActionOptions) {
      return adapter.read(await loc(), { timeout: t(opts) });
    },
  }, ctx, ["select", "read"], meta);
}
