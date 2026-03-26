/**
 * Read-only text element — wraps any element whose visible text
 * content is the value of interest (headings, paragraphs, spans, etc.).
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for read-only text content elements. */
export interface TextElement extends BaseElement<TextElement> {
  /** Read the element's trimmed text content. */
  read(options?: ActionOptions): Promise<string>;
}

/**
 * Create a text element wrapper.
 * * **Note:** `text()` reads `textContent` directly and does not use the
 * handler registry. Custom handler registrations for text elements are
 * not consulted. This is intentional — text elements are read-only and
 * do not need the detection/set/get pipeline.
 * * @param by    - Locator strategy (e.g. `By.css("[data-testid='action-output']")`).
 * @param scope - Page or parent locator to search within.
 */
export function text(by: By, scope: Scope, options?: ElementOptions): TextElement {
  const { loc, t, base, ctx, meta } = buildElement<TextElement>(by, scope, options,
    (ms) => text(by, scope, { ...options, timeout: ms }));

  return wrapElement("text", {
    ...base,
    async read(opts?: ActionOptions) {
      return ((await (await loc()).textContent({ timeout: t(opts) })) ?? "").trim();
    },
  }, ctx, ["read"], meta);
}
