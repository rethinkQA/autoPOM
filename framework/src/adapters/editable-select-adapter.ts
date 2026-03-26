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
import { isRetryableInteractionError } from "../playwright-errors.js";
import { getTimeouts } from "../timeouts.js";

export const editableSelectAdapter: SelectAdapter = {
  async select(locator: Locator, value: string, options?: ActionOptions): Promise<void> {
    const t = options?.timeout;
    const page = locator.page();
    const cfg = getTimeouts();

    // Fill the input to trigger the autocomplete dropdown.
    await locator.clear({ timeout: t });
    await locator.fill(value, { timeout: t });

    // P2-164: Retry loop for dropdown rendering — component frameworks
    // (React, Vue, Angular, Lit) need at least one render cycle after
    // fill() to filter dropdown options.  Poll until an option appears
    // or the deadline expires, matching genericNonEditableSelectAdapter.
    const deadline = Date.now() + (t ?? cfg.selectClickTimeoutMs * cfg.selectMaxRetries);

    for (let attempt = 0; attempt < cfg.selectMaxRetries; attempt++) {
      if (Date.now() > deadline) break;

    try {
      // ── Strategy 1: aria-controls / aria-owns listbox ────────
      const listboxId =
        (await locator.getAttribute("aria-controls").catch(() => null)) ??
        (await locator.getAttribute("aria-owns").catch(() => null));

      if (listboxId) {
        const escapedId = cssEscape(listboxId);
        // P3-99/P3-188: Use page-level locator instead of XPath ancestor
        // traversal which cannot cross shadow DOM or iframe boundaries.
        const option = page.locator(`#${escapedId}`)
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
      // P3-189: Search both role="option" and role="menuitem" to
      // cover non-standard listbox containers (e.g. role="menu").
      const option = page.locator('[role="listbox"], [role="menu"]')
        .getByRole("option", { name: value })
        .or(page.getByRole("menuitem", { name: value }));
      if ((await option.count()) > 0) {
        await option.first().click({ timeout: t });
        return;
      }

      // P2-164: Wait for next render cycle before retrying.
      await page.evaluate(() => new Promise<void>(r =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ));
    } catch (e) {
      if (!isRetryableInteractionError(e)) {
        // Close the dropdown on failure so subsequent interactions
        // don't see a stale dropdown overlay.
        await locator.press("Escape").catch(() => {});
        throw e;
      }
      // Retryable error — wait and try again
      await page.evaluate(() => new Promise<void>(r =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ));
    }
    } // end retry loop

    // All retries exhausted — close dropdown and throw.
    await locator.press("Escape").catch(() => {});
    throw new Error(
      `editableSelectAdapter: no matching option found for value "${value}". ` +
        `The combobox input was filled but no dropdown option could be selected ` +
        `after ${cfg.selectMaxRetries} attempts.`,
    );
  },

  async read(locator: Locator, options?: ActionOptions): Promise<string> {
    // For editable <input>/<textarea> comboboxes, inputValue() is the
    // correct read strategy (textContent on <input> is always empty).
    return locator.inputValue({ timeout: options?.timeout });
  },
};
