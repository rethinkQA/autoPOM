/**
 * Text input element — wraps `<input type="text">`, `<textarea>`, and
 * other fillable text fields.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement, requireHandler } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for fillable text input elements. */
export interface TextInputElement extends BaseElement<TextInputElement> {
  /** Type a value into the input (replaces existing content). */
  fill(value: string, options?: ActionOptions): Promise<void>;
  /** Clear the input's current value. */
  clear(options?: ActionOptions): Promise<void>;
  /** Read the input's current value. */
  read(options?: ActionOptions): Promise<string>;
}

/**
 * Create a text input element wrapper.
 *
 * @param by    - Locator strategy (e.g. `By.label("Search")`).
 * @param scope - Page or parent locator to search within.
 */
export function textInput(by: By, scope: Scope, options?: ElementOptions): TextInputElement {
  const { loc, t, base, ctx, meta } = buildElement<TextInputElement>(by, scope, options,
    (ms) => textInput(by, scope, { ...options, timeout: ms }));

  return wrapElement("textInput", {
    ...base,
    async fill(value: string, opts?: ActionOptions) {
      const handler = requireHandler(ctx, "input");
      await handler.set(await loc(), value, { timeout: t(opts) });
    },
    async clear(opts?: ActionOptions) {
      // Unique to typed wrapper — no standalone clear in the handler registry
      await (await loc()).clear({ timeout: t(opts) });
    },
    async read(opts?: ActionOptions) {
      const handler = requireHandler(ctx, "input");
      return (await handler.get(await loc(), { timeout: t(opts) })) as string;
    },
  }, ctx, ["fill", "clear", "read"], meta);
}
