/**
 * Button element — wraps `<button>`, `<input type="submit">`, or
 * elements with `role="button"`.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement, requireHandler } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for button elements. */
export interface ButtonElement extends BaseElement<ButtonElement> {
  /** Click the button. */
  click(options?: ActionOptions): Promise<void>;
  /** Read the button's visible text. */
  read(options?: ActionOptions): Promise<string>;
}

/**
 * Create a button element wrapper.
 *
 * @param by    - Locator strategy (e.g. `By.label("Add to Cart")`).
 * @param scope - Page or parent locator to search within.
 */
export function button(by: By, scope: Scope, options?: ElementOptions): ButtonElement {
  const { loc, t, base, ctx, meta } = buildElement<ButtonElement>(by, scope, options,
    (ms) => button(by, scope, { ...options, timeout: ms }));

  return wrapElement("button", {
    ...base,
    async click(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "button");
      await handler.set(await loc(), "", { timeout: t(opts) });
    },
    async read(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "button");
      return (await handler.get(await loc(), { timeout: t(opts) })) as string;
    },
  }, ctx, ["click", "read"], meta);
}
