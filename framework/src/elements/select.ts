/**
 * Select (dropdown) element — wraps a `<select>` element identified
 * by label, role, or CSS selector.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement, requireHandler } from "./base.js";
import { wrapElement } from "../wrap-element.js";
import type { SelectAdapter } from "./select-adapter.js";

/** Typed wrapper for `<select>` dropdown elements. */
export interface SelectElement extends BaseElement<SelectElement> {
  /** Choose an option by its visible text. */
  choose(option: string, options?: ActionOptions): Promise<void>;
  /** Read the currently selected option's visible text. */
  read(options?: ActionOptions): Promise<string>;
  /** List all available option labels. */
  options(options?: ActionOptions): Promise<string[]>;
}

/** Options for the {@link select} element factory. */
export interface SelectOptions extends ElementOptions {
  /** Override the default native select adapter. */
  adapter?: SelectAdapter;
}

/**
 * Create a select element wrapper.
 *
 * Uses the native `<select>` adapter by default.
 * Pass a custom adapter for framework-specific selects:
 *
 * ```ts
 * const dropdown = select(By.label("Category"), page, { adapter: muiSelectAdapter });
 * ```
 *
 * @param by    - Locator strategy (e.g. `By.label("Category")`).
 * @param scope - Page or parent locator to search within.
 */
export function select(by: By, scope: Scope, options?: SelectOptions): SelectElement {
  const { loc, t, base, ctx, meta } = buildElement<SelectElement>(by, scope, options,
    (ms) => select(by, scope, { ...options, timeout: ms }));
  const adapter = options?.adapter;

  return wrapElement("select", {
    ...base,
    async choose(option: string, opts?: ActionOptions) {
      if (adapter) {
        await adapter.select(await loc(), option, { timeout: t(opts) });
      } else {
        const handler = requireHandler(ctx, "select");
        await handler.set(await loc(), option, { timeout: t(opts) });
      }
    },
    async read(opts?: ActionOptions) {
      if (adapter) {
        return adapter.read(await loc(), { timeout: t(opts) });
      } else {
        const handler = requireHandler(ctx, "select");
        return (await handler.get(await loc(), { timeout: t(opts) })) as string;
      }
    },
    async options(opts?: ActionOptions) {
      if (adapter?.options) {
        return adapter.options(await loc(), { timeout: t(opts) });
      }
      // Fallback: native <option> elements
      const el = (await loc()).locator("option");
      const count = await el.count();
      if (count === 0) return [];
      try {
        await el.first().waitFor({ state: "attached", timeout: t(opts) });
      } catch {
        throw new Error(
          "select.options(): no native <option> elements found. " +
          "If using a component library select (MUI, Shoelace, Vuetify), provide a SelectAdapter.",
        );
      }
      return (await el.allTextContents()).map((s) => s.trim());
    },
  }, ctx, ["choose", "read", "options"], meta);
}
