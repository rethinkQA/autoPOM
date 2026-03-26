/**
 * Radio group element — wraps a container of `<input type="radio">`
 * elements sharing a common name.
 *
 * @module
 */
import { By, type Scope } from "../by.js";
import { resolveInputLabel } from "../label-resolution.js";
import type { ActionOptions, LabelActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement, requireHandler } from "./base.js";
import { wrapElement } from "../wrap-element.js";

/** Typed wrapper for radio group elements. */
export interface RadioElement extends BaseElement<RadioElement> {
  /** Select a radio option by its visible label. */
  choose(option: string, options?: ActionOptions): Promise<void>;
  /** Read the label of the currently selected radio option. */
  read(options?: LabelActionOptions): Promise<string>;
  /** List all available radio option labels. */
  options(options?: LabelActionOptions): Promise<string[]>;
}

/**
 * Create a radio group element wrapper.
 *
 * @param by    - Locator strategy (e.g. `By.css("[data-testid='radio-group']")`).
 * @param scope - Page or parent locator to search within.
 */
export function radio(by: By, scope: Scope, options?: ElementOptions): RadioElement {
  const { loc, t, base, ctx, meta } = buildElement<RadioElement>(by, scope, options,
    (ms) => radio(by, scope, { ...options, timeout: ms }));

  return wrapElement("radio", {
    ...base,
    async choose(option: string, opts?: ActionOptions) {
      const handler = requireHandler(ctx, "radiogroup");
      await handler.set(await loc(), option, { timeout: t(opts) });
    },
    async read(opts?: LabelActionOptions) {
      const handler = requireHandler(ctx, "radiogroup");
      return (await handler.get(await loc(), { timeout: t(opts) })) as string;
    },
    async options(opts?: LabelActionOptions) {
      const timeout = t(opts);
      const container = await loc();
      // Support both native <input type="radio"> and ARIA role="radio" (e.g. Bits UI)
      const radios = container.locator("input[type='radio'], [role='radio']");
      await radios.first().waitFor({ state: "attached", timeout });
      // P2-169: Wait for the radio count to stabilize — framework-rendered
      // UIs may render options incrementally across render cycles.
      let count = await radios.count();
      const stabilizeDeadline = Date.now() + Math.min(timeout ?? 5000, 1000);
      while (Date.now() < stabilizeDeadline) {
        await container.page().evaluate(() => new Promise<void>(r =>
          requestAnimationFrame(() => r()),
        ));
        const newCount = await radios.count();
        if (newCount === count) break;
        count = newCount;
      }
      const labels: string[] = [];

      for (let i = 0; i < count; i++) {
        const label = await resolveInputLabel(radios.nth(i), container, { timeout });
        if (label) {
          labels.push(label);
        } else {
          labels.push("[unlabeled]");
          try {
            ctx.logger.getLogger().warn(
              `radio.options(): radio input at index ${i} has no resolvable label — ` +
              `added as "[unlabeled]". Add an aria-label or associated <label> to make it identifiable.`,
            );
          } catch {
            // logger not available — skip warning
          }
        }
      }

      return labels;
    },
  }, ctx, ["choose", "read", "options"], meta);
}
