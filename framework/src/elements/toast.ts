/**
 * Toast / notification element — wraps transient notification messages
 * (e.g. "Added to cart") that appear and auto-dismiss.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for toast / notification elements. */
export interface ToastElement extends BaseElement<ToastElement> {
  /** Read the toast's visible text content. */
  read(options?: ActionOptions): Promise<string>;
}

/**
 * Create a toast element wrapper.
 *
 * @param by    - Locator strategy (e.g. `By.css("[data-testid='toast-notification']")`).
 * @param scope - Page or parent locator to search within.
 */
export function toast(by: By, scope: Scope, options?: ElementOptions): ToastElement {
  const { loc, t, base, ctx, meta } = buildElement<ToastElement>(by, scope, options,
    (ms) => toast(by, scope, { ...options, timeout: ms }));

  return wrapElement("toast", {
    ...base,
    async read(options?: ActionOptions) {
      return ((await (await loc()).textContent({ timeout: t(options) })) ?? "").trim();
    },
    // isVisible is intentionally NOT listed as an action — it is provided
    // by BaseElement and bypasses middleware, consistent with every other
    // element type.  See wrap-element.ts ACTIONS jsdoc for the convention.
  }, ctx, ["read"], meta);
}
