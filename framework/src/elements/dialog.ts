import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";
import { cssEscape } from "../dom-helpers.js";
import { DIALOG_CLOSE_TIMEOUT_MS } from "../timeouts.js";

/**
 * Default CSS selectors used to locate the dialog body/content container.
 * Covers common libraries: vanilla HTML, Bootstrap, Angular Material, etc.
 */
const DEFAULT_BODY_SELECTORS = [
  ".dialog-body",
  ".modal-body",
  ".modal-content",
  ".mat-mdc-dialog-content",
  "[mat-dialog-content]",
];

/**
 * Default CSS selectors used to locate a dismiss/close button inside the
 * dialog when the role-based ARIA strategies don't match.
 *
 * Uses **exact** (`=`) rather than substring (`*=`) matching for "close" to
 * avoid false-positives like "Close Account" or "Close Window".
 * "dismiss" is unambiguous enough for substring matching.
 */
const DEFAULT_CLOSE_SELECTORS = [
  'button[aria-label="close" i]',
  'button[aria-label="close dialog" i]',
  'button[aria-label*="dismiss" i]',
  'button.close',     // Bootstrap 4
  'button.btn-close', // Bootstrap 5
];

export interface DialogOptions extends ElementOptions {
  /**
   * Extra CSS selectors appended to the built-in list for locating the
   * dialog body container (used by `body()`).
   *
   * Example — to support Radix UI and Headless UI:
   * ```ts
   * dialog(By.role("dialog"), page, {
   *   bodySelectors: ["[data-radix-dialog-content]", "[data-headlessui-dialog-panel]"],
   * })
   * ```
   */
  bodySelectors?: string[];
  /**
   * Extra CSS selectors appended to the built-in list for locating a close
   * button inside the dialog (used by `close()` as a fallback strategy).
   */
  closeSelectors?: string[];
}

export interface DialogElement extends BaseElement<DialogElement> {
  isOpen(options?: ActionOptions): Promise<boolean>;
  close(options?: ActionOptions): Promise<void>;
  title(options?: ActionOptions): Promise<string>;
  body(options?: ActionOptions): Promise<string>;
}

export function dialog(by: By, scope: Scope, options?: DialogOptions): DialogElement {
  const { loc, t, base, ctx, meta } = buildElement<DialogElement>(by, scope, options,
    (ms) => dialog(by, scope, { ...options, timeout: ms }));

  const bodySelectors = [
    ...DEFAULT_BODY_SELECTORS,
    ...(options?.bodySelectors ?? []),
  ];
  const closeSelectors = [
    ...DEFAULT_CLOSE_SELECTORS,
    ...(options?.closeSelectors ?? []),
  ];

  return wrapElement("dialog", {
    ...base,
    async isOpen(opts?: ActionOptions) {
      const el = await loc();
      const timeout = t(opts);
      // If the dialog element isn't in the DOM at all, it's closed.
      // This handles framework dialogs (React, Svelte, Next.js) that
      // unmount the element entirely when dismissed via conditional rendering.
      const count = await el.count();
      if (count === 0) return false;

      // Native <dialog> uses the `open` attribute (set by showModal() or <dialog open>).
      const tag = await el.evaluate((node) => node.tagName.toLowerCase());
      if (tag === "dialog") {
        const open = await el.getAttribute("open", { timeout: timeout });
        return open !== null;
      }

      // Framework dialogs (Angular MatDialog, Headless UI, etc.)
      // use role="dialog" and toggle visibility or mount/unmount.
      return el.isVisible({ timeout });
    },

    async close(opts?: ActionOptions) {
      const el = await loc();
      const timeout = t(opts);

      // All strategies use Playwright locators which auto-pierce Shadow DOM,
      // unlike the previous querySelectorAll-based evaluate() approach.

      // Helper: given a locator, return the last match if multiple exist,
      // or the only match, or null if none.
      //
      // **Why last?**  Dialogs are typically rendered at the *end* of a
      // container's child list.  When multiple close buttons appear (e.g.
      // a close icon in the header *and* a "Close" text button in the
      // footer), the last one in DOM order is almost always the primary
      // dismiss affordance.  Picking last also plays well with stacked
      // dialogs — the topmost (last-rendered) dialog's close button wins.
      const pickLastOrOnly = async (candidate: ReturnType<typeof el.locator>) => {
        const count = await candidate.count();
        if (count === 0) return null;
        return count === 1 ? candidate : candidate.nth(count - 1);
      };

      // Perform the close action, then wait for the dialog to actually close.
      const performClose = async (action: () => Promise<void>) => {
        await action();
        // Wait for the dialog to be removed from DOM or become hidden.
        // This handles animation delays (e.g. Angular CDK, CSS transitions).
        const closeTimeout = timeout ?? DIALOG_CLOSE_TIMEOUT_MS;
        await el.waitFor({ state: "hidden", timeout: closeTimeout }).catch(() => {
          // Issue #128: log a warning instead of silently swallowing.
          // Callers can check isOpen() to detect the still-open dialog.
          ctx.logger.getLogger().warn(
            `dialog.close(): dialog did not become hidden within ${closeTimeout}ms ` +
            `after close action — it may still be open`,
          );
        });
      };

      // Strategy 1: button whose aria-label matches /close dialog/i
      const ariaCloseDialog = el.getByRole("button", { name: /close\s*dialog/i });
      const ariaMatch = await pickLastOrOnly(ariaCloseDialog);
      if (ariaMatch) {
        await performClose(() => ariaMatch.click({ timeout }));
        return;
      }

      // Strategy 2: button whose accessible name is exactly "close"
      const closeBtn = el.getByRole("button", { name: /^close$/i });
      const closeMatch = await pickLastOrOnly(closeBtn);
      if (closeMatch) {
        await performClose(() => closeMatch.click({ timeout }));
        return;
      }

      // Strategy 3: CSS fallback selectors (configurable)
      const cssFallback = el.locator(closeSelectors.join(", "));
      const cssMatch = await pickLastOrOnly(cssFallback);
      if (cssMatch) {
        await performClose(() => cssMatch.click({ timeout }));
        return;
      }

      // Strategy 4: Escape fallback — works for native showModal() and many framework dialogs
      await performClose(() => el.press("Escape", { timeout }));
    },

    async title(opts?: ActionOptions) {
      const el = await loc();
      const timeout = t(opts);
      // Prefer ARIA heading role (works across all implementations)
      const roleHeading = el.getByRole("heading").first();
      if ((await roleHeading.count()) > 0) {
        return ((await roleHeading.textContent({ timeout: timeout })) ?? "").trim();
      }
      // Fallback: any h1-h6
      const anyH = el.locator("h1, h2, h3, h4, h5, h6").first();
      if ((await anyH.count()) > 0) {
        return ((await anyH.textContent({ timeout: timeout })) ?? "").trim();
      }
      // Last resort: aria-labelledby target(s) — spec allows space-separated IDs.
      // Search from the page root, not scoped to the dialog, because
      // aria-labelledby can reference elements anywhere in the document
      // (common with portaled content). Fixes Issue #127.
      const labelledBy = await el.getAttribute("aria-labelledby", { timeout: timeout });
      if (labelledBy) {
        const ids = labelledBy.trim().split(/\s+/);
        const parts: string[] = [];
        const page = el.page();
        for (const id of ids) {
          const target = page.locator(`#${cssEscape(id)}`);
          if ((await target.count()) > 0) {
            parts.push(((await target.textContent({ timeout: timeout })) ?? "").trim());
          }
        }
        if (parts.length > 0) return parts.join(" ");
      }
      return "";
    },

    async body(opts?: ActionOptions) {
      const el = await loc();
      const timeout = t(opts);
      // Strategy 1: Dedicated body/content container (configurable selector list)
      const bodyContainer = el.locator(bodySelectors.join(", "));
      if ((await bodyContainer.count()) > 0) {
        // Return the text content of <p> elements within the body container,
        // excluding headings and buttons to get just the body text.
        const paragraphs = bodyContainer.first().locator("p");
        if ((await paragraphs.count()) > 0) {
          const texts = await paragraphs.allTextContents();
          return texts.map((s) => s.trim()).join("\n");
        }
        return ((await bodyContainer.first().textContent({ timeout: timeout })) ?? "").trim();
      }
      // Strategy 2: All <p> elements directly in the dialog (skip heading/button)
      const paragraphs = el.locator("p");
      if ((await paragraphs.count()) > 0) {
        const texts = await paragraphs.allTextContents();
        return texts.map((s) => s.trim()).join("\n");
      }
      return "";
    },
  }, ctx, ["isOpen", "close", "title", "body"], meta);
}
