/**
 * ElementClassifier — stateless DOM element classification algorithm.
 *
 * Extracted from {@link HandlerRegistry} so that the detection logic
 * is independently testable, swappable, and free of registry/cache
 * concerns.
 *
 * The classifier accepts pre-computed data (serialised detection rules,
 * the handler list, and a fallback handler) and returns the matching
 * handler for a given DOM element.
 */

import type { Locator } from "@playwright/test";
import type { DetectRule, ElementHandler } from "./handler-types.js";
import type { Logger } from "./types.js";
import { NoHandlerMatchError } from "./errors.js";

// ── Types ───────────────────────────────────────────────────

/** Shape of the serialised detection rules sent into evaluate(). */
export type SerializedEntry = { idx: number; detect: DetectRule[] };

// ── classifyElement ─────────────────────────────────────────

/**
 * Classify a DOM element by running the full detection ruleset and
 * returning the matching handler.
 *
 * **Phase 1** — a single `evaluate()` round-trip checks tag, role,
 * attr, and inputType.  Rules that also require a child selector
 * are collected as candidates rather than checked via `querySelector`
 * (which cannot pierce Shadow DOM).
 *
 * **Phase 2** — each candidate's `requireChild` selector is verified
 * with Playwright's `locator().count()`, which *does* pierce shadow
 * boundaries.
 *
 * ---
 *
 * **Shoelace / Web Component Shadow DOM Risk (Issue 116, Phase 9.5.3):**
 *
 * Shoelace components nest multiple shadow roots (e.g.
 * `<sl-select>` → shadow → `<sl-popup>` → shadow → `<sl-option>`).
 * The `requireChild` CSS selector in Phase 1 runs inside `evaluate()`
 * via the browser's `querySelector`, which does **not** cross shadow
 * boundaries.  Phase 2's Playwright `locator().count()` **does** pierce
 * one level of shadow DOM, but may not reach deeply nested children.
 *
 * **Expected fix path for Phase 10.6 (Shoelace / Lit migration):**
 * - Add tag-name-based detect rules (e.g. `{ tags: ["sl-select"] }`)
 *   that match Shoelace custom elements without relying on
 *   `requireChild` at all.
 * - Register these via `createHandler({ extends: "select", ... })` with
 *   Shoelace-specific detect rules and a custom `SelectAdapter`.
 * - If deeply nested `requireChild` detection is needed, consider a
 *   recursive shadow DOM query helper in a future phase.
 *
 * See also: ROADMAP.md Phase 10.6 checklist.
 *
 * ---
 *
 * @param el        The Playwright Locator pointing at the DOM element.
 * @param handlers  The full ordered handler list (indices in
 *                  `serialized` map back into this array).
 * @param serialized  Pre-computed serialised detection rules.
 * @param fallback  The catch-all handler used when nothing else matches.
 * @param logger    Logger for diagnostic messages.
 * @param options.fallback  When `true`, fall back to the catch-all
 *   handler instead of throwing.  Defaults to `false`.
 */
export async function classifyElement(
  el: Locator,
  handlers: readonly ElementHandler[],
  serialized: SerializedEntry[],
  fallback: ElementHandler,
  logger: Logger,
  options?: { fallback?: boolean },
): Promise<ElementHandler> {
  // Phase 1: tag / role / attr / inputType matching in a single evaluate().
  // Rules with requireChild are deferred to Phase 2 instead of using
  // querySelector (which doesn't cross Shadow DOM boundaries).
  const result = await el.evaluate(
    (node: Element, rules: SerializedEntry[]) => {
      const tag = node.tagName.toLowerCase();
      const role = node.getAttribute("role");
      const inputType =
        tag === "input"
          ? (node as HTMLInputElement).type.toLowerCase()
          : "";

      const candidates: { idx: number; requireChild: string }[] = [];
      let directIdx = -1;

      for (const { idx, detect } of rules) {
        // Skip entries that can't beat an already-found direct match
        if (directIdx >= 0 && idx >= directIdx) continue;

        for (const rule of detect) {
          let primary = false;

          if (rule.tags?.includes(tag)) {
            if (rule.inputTypes && !rule.inputTypes.includes(inputType)) {
              continue;
            }
            primary = true;
          }

          if (!primary && rule.roles && role && rule.roles.includes(role)) {
            primary = true;
          }

          if (!primary && rule.attr) {
            if (node.getAttribute(rule.attr[0]) === rule.attr[1]) {
              primary = true;
            }
          }

          if (!primary) continue;

          if (!rule.requireChild) {
            // Record as best direct match so far (lowest idx wins)
            if (directIdx < 0 || idx < directIdx) {
              directIdx = idx;
            }
          } else {
            // Defer requireChild verification to Phase 2
            candidates.push({ idx, requireChild: rule.requireChild });
          }

          // First matching detect rule for this handler is enough
          break;
        }
      }

      // Filter out candidates that can't beat the best direct match
      const viable = directIdx >= 0
        ? candidates.filter(c => c.idx < directIdx)
        : candidates;

      return { idx: directIdx, tag, role: role ?? "", candidates: viable };
    },
    serialized,
  );

  // Phase 2: verify requireChild candidates using Playwright locators,
  // which pierce Shadow DOM unlike querySelector inside evaluate().
  // Candidates are already filtered to only those with lower idx than
  // the best direct match, so the first verified candidate wins overall.
  for (const candidate of result.candidates) {
    const count = await el.locator(candidate.requireChild).count();
    if (count > 0) return handlers[candidate.idx];
  }

  // Fall back to direct match if no requireChild candidate verified
  if (result.idx >= 0) return handlers[result.idx];

  const desc = `<${result.tag}${result.role ? ` role="${result.role}"` : ""}>`;

  if (options?.fallback) {
    logger.debug(
      `[classifyElement] No handler matched ${desc}.` +
      ` Falling back to generic input handler ("${fallback.type}").` +
      ` If this element is not a text input, the next set/get call will likely fail.`,
    );
    return fallback;
  }

  throw new NoHandlerMatchError(
    `[classifyElement] No handler matched ${desc}. ` +
    `Register a custom handler for this element or pass { fallback: true } to detectHandler.`,
    { tag: result.tag, role: result.role || undefined },
  );
}
