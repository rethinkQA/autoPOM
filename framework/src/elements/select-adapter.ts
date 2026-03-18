/**
 * SelectAdapter — technology-agnostic interface for selecting values
 * from dropdown / combobox elements.
 *
 * Native `<select>` elements use `selectOption()` / `:checked` text,
 * but component library selects (`<mat-select>`, MUI `<Select>`,
 * `<v-select>`, `<sl-select>`, shadcn `<Select>`) render
 * `role="combobox"` on a non-editable `<div>` — `fill()` would throw.
 *
 * The adapter pattern (same as {@link DatePickerAdapter}) lets each
 * technology plug in its own open-listbox → click-option sequence
 * while the framework handles detection, retry, and middleware.
 *
 * @module
 */

import type { Locator } from "@playwright/test";
import type { ActionOptions } from "../handler-types.js";
import { readSelectedOptionText } from "../dom-helpers.js";

/**
 * Adapter interface for technology-specific select / combobox interactions.
 *
 * Implement this to support component library selects that render
 * `role="combobox"` on a non-editable element (div, button, etc.).
 */
export interface SelectAdapter {
  /**
   * Select a value from the dropdown.
   *
   * Implementations should handle opening the dropdown, finding the
   * matching option, and clicking it.
   */
  select(locator: Locator, value: string, options?: ActionOptions): Promise<void>;

  /**
   * Read the currently selected value's visible text.
   */
  read(locator: Locator, options?: ActionOptions): Promise<string>;

  /**
   * List all available option labels.
   *
   * Optional — if not implemented, falls back to native `<option>` locator.
   */
  options?(locator: Locator, options?: ActionOptions): Promise<string[]>;
}

/**
 * Default adapter for native `<select>` elements.
 *
 * Wraps the existing `selectOption()` / `readSelectedOptionText()` logic
 * so native selects continue to work unchanged when no custom adapter
 * is provided.
 */
export const nativeSelectAdapter: SelectAdapter = {
  async select(locator, value, options) {
    await locator.selectOption(value, { timeout: options?.timeout });
  },
  async read(locator, options) {
    return readSelectedOptionText(locator, options);
  },
  async options(locator, options) {
    const opts = locator.locator("option");
    await opts.first().waitFor({ state: "attached", timeout: options?.timeout });
    return (await opts.allTextContents()).map((s) => s.trim());
  },
};
