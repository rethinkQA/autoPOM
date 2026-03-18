/**
 * Generic non-editable combobox adapter.
 *
 * Lives in the `adapters/` layer so that `default-handlers.ts` (handler
 * layer) can import it without crossing into the `elements/` layer.
 *
 * Used by the built-in `comboboxSet` handler when the target element
 * is not an `<input>` or `<textarea>` (i.e. a `<div>`, `<button>`, or
 * other non-editable element rendered by a component library select).
 *
 * Strategy:
 * 1. Click the element to open the dropdown / listbox.
 * 2. Find a matching `role="option"` by name in the associated listbox
 *    (via `aria-controls` / `aria-owns`) or nearby in the DOM.
 * 3. Click the matching option.
 *
 * For component libraries with unusual DOM structures (deeply nested
 * shadow roots, portaled overlays, etc.), implement a custom
 * {@link SelectAdapter} and register a handler override.
 *
 * @module
 */

import type { SelectAdapter } from "../elements/select-adapter.js";
import { cssEscape } from "../dom-helpers.js";
import { isRetryableInteractionError } from "../playwright-errors.js";
import {
  SELECT_CLICK_TIMEOUT_MS,
  SELECT_MAX_RETRIES,
  SELECT_RETRY_DELAY_MS,
  SELECT_EXPAND_DEADLINE_MS,
  SELECT_OPTION_VISIBLE_MS,
  POLL_INTERVAL_MS,
} from "../timeouts.js";

export const genericNonEditableSelectAdapter: SelectAdapter = {
  async select(locator, value, options) {
    const t = options?.timeout;

    // Retry loop: portal-mounted dropdowns (Bits UI, Radix, etc.) may
    // populate asynchronously.  Poll for the option to appear.
    // Use page-level locators (not XPath ancestors) so searches work
    // even when the combobox lives inside a shadow root (e.g. Shoelace).
    const page = locator.page();
    const clickTimeout = Math.min(t ?? SELECT_CLICK_TIMEOUT_MS, SELECT_CLICK_TIMEOUT_MS);

    for (let attempt = 0; attempt < SELECT_MAX_RETRIES; attempt++) {
      // ── Open the dropdown ───────────────────────────────────
      // Flush any pending framework renders (Lit requestUpdate, Vue
      // nextTick, etc.) before interacting with the dropdown.  This
      // prevents the dropdown from opening during a re-render that
      // would immediately close or destabilise it.
      await page.evaluate(() => new Promise<void>(r =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ));

      // Check aria-expanded to avoid toggling a dropdown closed.
      const expanded = await locator.getAttribute("aria-expanded").catch(() => null);

      if (expanded === "true") {
        // Verify the popup is actually visible — some web component
        // libraries (Shoelace) can end up with aria-expanded="true"
        // while the popup overlay is hidden after a concurrent re-render.
        // Scope the check to the aria-controls/aria-owns listbox when
        // available to avoid false positives when multiple comboboxes
        // are open simultaneously (#131).
        const popupId =
          (await locator.getAttribute("aria-controls").catch(() => null)) ??
          (await locator.getAttribute("aria-owns").catch(() => null));
        const optionScope = popupId
          ? page.locator(`#${cssEscape(popupId)} [role="option"], #${cssEscape(popupId)}[role="listbox"] [role="option"]`)
          : page.locator('[role="option"]');
        const anyOptionVisible = await optionScope
          .first()
          .isVisible()
          .catch(() => false);
        if (!anyOptionVisible) {
          // Inconsistent state — close the dropdown and retry.
          await locator.click({ timeout: clickTimeout }).catch((e: unknown) => {
            if (!isRetryableInteractionError(e)) throw e;
          });
          await page.waitForTimeout(SELECT_RETRY_DELAY_MS);
          continue;
        }
      } else {
        await locator.click({ timeout: clickTimeout });
        // Wait for the dropdown to actually open.
        // Poll getAttribute() instead of using expect().toHaveAttribute()
        // to avoid a runtime dependency on @playwright/test.
        const expandDeadline = Date.now() + SELECT_EXPAND_DEADLINE_MS;
        while (Date.now() < expandDeadline) {
          const val = await locator.getAttribute("aria-expanded").catch(() => null);
          if (val === "true") break;
          await page.waitForTimeout(POLL_INTERVAL_MS);
        }
        // Wait for the popup/options to be rendered and visible.
        try {
          await page.locator('[role="option"]').first().waitFor({ state: "visible", timeout: SELECT_OPTION_VISIBLE_MS });
        } catch (e) {
          if (!isRetryableInteractionError(e)) throw e;
          // Options may not be role="option" (native <option>) — continue
        }
      }

      // ── Strategy 1: aria-controls / aria-owns listbox ──────
      const listboxId =
        (await locator.getAttribute("aria-controls").catch(() => null)) ??
        (await locator.getAttribute("aria-owns").catch(() => null));

      if (listboxId) {
        const escapedId = cssEscape(listboxId);
        const option = page
          .locator(`#${escapedId}`)
          .getByRole("option", { name: value });
        if ((await option.count()) > 0) {
          try {
            await option.first().click({ timeout: clickTimeout });
            return;
          } catch (e) {
            if (!isRetryableInteractionError(e)) throw e;
            // Click may fail if option is animating — retry
          }
        }
      }

      // ── Strategy 2: nearby listbox (XPath ancestor) ────────
      const nearbyListbox = locator
        .locator("xpath=ancestor::*[position() <= 5]")
        .locator('[role="listbox"]');
      if ((await nearbyListbox.count()) > 0) {
        const option = nearbyListbox
          .first()
          .getByRole("option", { name: value });
        if ((await option.count()) > 0) {
          try {
            await option.first().click({ timeout: clickTimeout });
            return;
          } catch (e) {
            if (!isRetryableInteractionError(e)) throw e;
            // retry
          }
        }
      }

      // ── Strategy 3: page-level getByRole ───────────────────
      const option = page.getByRole("option", { name: value });
      if ((await option.count()) > 0) {
        try {
          await option.first().click({ timeout: clickTimeout });
          return;
        } catch (e) {
          if (!isRetryableInteractionError(e)) throw e;
          // Option found but not clickable — will retry
        }
      }

      // ── Strategy 4: CSS selector fallback (shadow DOM) ─────
      // For web components where getByRole may fail to traverse nested
      // shadow roots.  Match by text content using generic selectors
      // that work across component libraries (#130 — removed
      // Shoelace-specific 'sl-option' tag).
      for (const sel of ['[role="option"]', '[part="option"]']) {
        const cssOptions = page.locator(sel);
        const cssCount = await cssOptions.count();
        if (cssCount === 0) continue;
        for (let i = 0; i < cssCount; i++) {
          const text = ((await cssOptions.nth(i).textContent()) ?? "").trim();
          if (text === value) {
            try {
              await cssOptions.nth(i).click({ timeout: clickTimeout });
              return;
            } catch (e) {
              if (!isRetryableInteractionError(e)) throw e;
              // Retryable click failure — continue to next strategy/attempt
            }
          }
        }
      }

      // Wait before retry
      await page.waitForTimeout(SELECT_RETRY_DELAY_MS);
    }

    throw new Error(
      `genericNonEditableSelectAdapter: no matching option found for value "${value}". ` +
        `The combobox was clicked to open the dropdown but no option could be selected.`,
    );
  },

  async read(locator, options) {
    // For non-editable comboboxes, the displayed value is typically
    // the text content of the trigger element itself.
    // For readonly <input> elements (e.g. Shoelace sl-select), use
    // inputValue() since textContent() would return empty.
    const tagName = await locator.evaluate((node) => node.tagName.toLowerCase());
    if (tagName === "input" || tagName === "textarea") {
      return (await locator.inputValue({ timeout: options?.timeout })).trim();
    }
    return ((await locator.textContent({ timeout: options?.timeout })) ?? "").trim();
  },

  async options(locator, options) {
    const page = locator.page();
    const clickTimeout = Math.min(options?.timeout ?? SELECT_CLICK_TIMEOUT_MS, SELECT_CLICK_TIMEOUT_MS);

    // Open the dropdown to enumerate options
    const expanded = await locator.getAttribute("aria-expanded").catch(() => null);
    if (expanded !== "true") {
      await locator.click({ timeout: clickTimeout });
      // Wait for dropdown to open
      const expandDeadline = Date.now() + SELECT_EXPAND_DEADLINE_MS;
      while (Date.now() < expandDeadline) {
        const val = await locator.getAttribute("aria-expanded").catch(() => null);
        if (val === "true") break;
        await page.waitForTimeout(POLL_INTERVAL_MS);
      }
    }

    // Collect option text via aria-controls/aria-owns listbox first
    const listboxId =
      (await locator.getAttribute("aria-controls").catch(() => null)) ??
      (await locator.getAttribute("aria-owns").catch(() => null));

    let labels: string[] = [];
    if (listboxId) {
      const escapedId = cssEscape(listboxId);
      const optionEls = page.locator(`#${escapedId}`).getByRole("option");
      const count = await optionEls.count();
      for (let i = 0; i < count; i++) {
        const text = ((await optionEls.nth(i).textContent()) ?? "").trim();
        if (text) labels.push(text);
      }
    }

    // Fallback: page-level role="option"
    if (labels.length === 0) {
      const optionEls = page.getByRole("option");
      const count = await optionEls.count();
      for (let i = 0; i < count; i++) {
        const text = ((await optionEls.nth(i).textContent()) ?? "").trim();
        if (text) labels.push(text);
      }
    }

    // Close the dropdown by clicking the trigger again
    await locator.click({ timeout: clickTimeout }).catch((e: unknown) => {
      if (!isRetryableInteractionError(e)) throw e;
    });

    return labels;
  },
};
