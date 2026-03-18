/**
 * Editable combobox adapter — handles `<input>` / `<textarea>` elements
 * with `role="combobox"` that accept typed text to filter a dropdown.
 *
 * Extracted from the inline `comboboxSet` / `comboboxGet` logic in
 * `default-handlers.ts` (Issue #119) so that all select/combobox
 * interaction strategies live behind the {@link SelectAdapter} interface.
 *
 * **Strategy (select):**
 * 1. Clear the input and type the desired value.
 * 2. Find the matching `role="option"` in the associated listbox
 *    (via `aria-controls` / `aria-owns`), nearby in the DOM, or
 *    page-level.
 * 3. Click the matching option.
 *
 * **Strategy (read):**
 * Returns `inputValue()` — the native value of the text input.
 *
 * @module
 */

import type { SelectAdapter } from "../elements/select-adapter.js";
import type { Locator } from "@playwright/test";
import type { ActionOptions } from "../handler-types.js";
import { cssEscape } from "../dom-helpers.js";

export const editableSelectAdapter: SelectAdapter = {
  async select(locator: Locator, value: string, options?: ActionOptions): Promise<void> {
    const t = options?.timeout;

    // Fill the input to trigger the autocomplete dropdown.
    await locator.clear({ timeout: t });
    await locator.fill(value, { timeout: t });

    // ── Strategy 1: aria-controls / aria-owns listbox ────────
    const listboxId =
      (await locator.getAttribute("aria-controls", { timeout: t })) ??
      (await locator.getAttribute("aria-owns", { timeout: t }));

    if (listboxId) {
      const escapedId = cssEscape(listboxId);
      const option = locator
        .locator("xpath=//ancestor::body")
        .locator(`#${escapedId}`)
        .getByRole("option", { name: value });
      if ((await option.count()) > 0) {
        await option.first().click({ timeout: t });
        return;
      }
    }

    // ── Strategy 2: nearby listbox (XPath ancestor) ──────────
    const nearbyListbox = locator
      .locator("xpath=ancestor::*[position() <= 5]")
      .locator('[role="listbox"]');
    if ((await nearbyListbox.count()) > 0) {
      const option = nearbyListbox
        .first()
        .getByRole("option", { name: value });
      if ((await option.count()) > 0) {
        await option.first().click({ timeout: t });
        return;
      }
    }

    // ── Strategy 3: page-level search ────────────────────────
    // Still needed for portaled/teleported dropdowns.
    const option = locator
      .locator("xpath=//ancestor::body")
      .getByRole("option", { name: value });
    if ((await option.count()) > 0) {
      await option.first().click({ timeout: t });
      return;
    }

    throw new Error(
      `editableSelectAdapter: no matching option found for value "${value}". ` +
        `The combobox input was filled but no dropdown option could be selected.`,
    );
  },

  async read(locator: Locator, options?: ActionOptions): Promise<string> {
    // For editable <input>/<textarea> comboboxes, inputValue() is the
    // correct read strategy (textContent on <input> is always empty).
    return locator.inputValue({ timeout: options?.timeout });
  },
};
