/**
 * Checkbox element — wraps `<input type="checkbox">` or elements with
 * `role="checkbox"` / `role="switch"`.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement, requireHandler } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for checkbox elements. */
export interface CheckboxElement extends BaseElement<CheckboxElement> {
  /** Check the checkbox (no-op if already checked). */
  check(options?: ActionOptions): Promise<void>;
  /** Uncheck the checkbox (no-op if already unchecked). */
  uncheck(options?: ActionOptions): Promise<void>;
  /** Return whether the checkbox is currently checked. */
  isChecked(options?: ActionOptions): Promise<boolean>;
  /** Read the checkbox state as a boolean. Alias for `isChecked()`. */
  read(options?: ActionOptions): Promise<boolean>;
}

/**
 * Create a checkbox element wrapper.
 *
 * @param by    - Locator strategy (e.g. `By.label("Show only in-stock")`).
 * @param scope - Page or parent locator to search within.
 */
export function checkbox(by: By, scope: Scope, options?: ElementOptions): CheckboxElement {
  const { loc, t, base, ctx, meta } = buildElement<CheckboxElement>(by, scope, options,
    (ms) => checkbox(by, scope, { ...options, timeout: ms }));

  // Build the element object. Uses `wrapped` (closure variable)
  // instead of `this` so that destructured methods work in strict mode:
  //   const { read } = el;  // safe
  const wrapped: CheckboxElement = wrapElement("checkbox", {
    ...base,
    async check(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "checkbox");
      await handler.set(await loc(), true, { timeout: t(opts) });
    },
    async uncheck(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "checkbox");
      await handler.set(await loc(), false, { timeout: t(opts) });
    },
    async isChecked(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "checkbox");
      return (await handler.get(await loc(), { timeout: t(opts) })) as boolean;
    },
    async read(opts?: ActionOptions) {
      // Delegates to the wrapped isChecked via closure variable.
      return wrapped.isChecked(opts);
    },
  }, ctx, ["check", "uncheck", "isChecked", "read"], meta);

  return wrapped;
}
