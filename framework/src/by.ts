/**
 * By — element identification strategy.
 *
 * Each static factory returns a By instance that resolves
 * to a Playwright Locator via resolve(scope). The scope can be
 * a Page (top-level) or a Locator (nested/scoped search).
 */
import type { Page, Locator } from "@playwright/test";
import type { Logger } from "./types.js";

/**
 * A scope is anything that supports Playwright's locator methods.
 * Both Page and Locator implement these, so elements can resolve
 * against the full page or within a parent locator.
 */
export type Scope = Page | Locator;

export class By {
  /**
   * The raw (probe-free) resolve function.  Stored as a private field
   * rather than a module-level WeakMap — static methods on the same
   * class can access private fields of other instances, so the former
   * WeakMap indirection was unnecessary.
   */
  private readonly _resolveRaw: (scope: Scope) => Promise<Locator>;
  private readonly _resolveWithProbes: (scope: Scope, logger: Logger | undefined) => Promise<Locator>;

  private constructor(
    resolveRaw: (scope: Scope) => Promise<Locator>,
    private readonly _descriptor: string,
    resolveWithProbes?: (scope: Scope, logger: Logger | undefined) => Promise<Locator>,
  ) {
    this._resolveRaw = resolveRaw;
    this._resolveWithProbes = resolveWithProbes ?? ((scope) => resolveRaw(scope));
  }

  /**
   * Resolve this By to a Playwright Locator against the given scope (Page or Locator).
   *
   * This method is always asynchronous so every By factory can safely
   * perform async probes (count checks, priority checks, ambiguity warnings)
   * without leaking implementation details to callers.
   */
  async resolve(scope: Scope, logger?: Logger): Promise<Locator> {
    return this._resolveWithProbes(scope, logger);
  }

  /** Human-readable descriptor for error messages and debugging. */
  toString(): string {
    return this._descriptor;
  }

  // ── Internal helpers ─────────────────────────────────────────

  /**
   * Retrieve the raw (probe-free) resolver for a `By` instance.
   * Used by composition factories to build locator chains without
   * re-running higher-level probes from nested strategies.
   */
  private static _getRawResolve(by: By): (scope: Scope) => Promise<Locator> {
    return by._resolveRaw;
  }

  /**
   * Builds an OR-chain locator from multiple By strategies.
   * Shared by By.any() and By.first() to avoid duplication.
   */
  private static async buildOrChain(bys: By[], scope: Scope): Promise<Locator> {
    const allLocators = await Promise.all(bys.map((b) => By._getRawResolve(b)(scope)));
    if (allLocators.length === 0) {
      throw new Error("buildOrChain requires at least one By strategy, but received an empty array.");
    }
    let locator = allLocators[0];
    for (let i = 1; i < allLocators.length; i++) {
      locator = locator.or(allLocators[i]);
    }
    return locator;
  }

  // ── Factory methods ──────────────────────────────────────────

  /**
   * Shared probe that warns when a locator matches more than one element.
   * Only fires when a logger is provided (i.e. opt-in via resolve(scope, logger)).
   */
  private static async _warnIfAmbiguous(
    loc: Locator,
    descriptor: string,
    logger: Logger | undefined,
  ): Promise<Locator> {
    // Skip the extra count() round-trip unless the caller has opted
    // into debug-level logging.  The default logger has debugEnabled
    // false, so production/CI runs pay zero overhead.
    if (!logger?.debugEnabled) return loc;
    const n = await loc.count();
    if (n > 1) {
      logger.warn(
        `[${descriptor}] matched ${n} elements — using first. ` +
        `This may cause flaky tests. Consider narrowing the selector.`,
      );
      return loc.first();
    }
    return loc;
  }

  /**
   * Internal helper — creates a simple By with a descriptor and a
   * resolve function, wired up with `_warnIfAmbiguous`.  Shared by
   * label(), role(), css(), text(), and shadow() to eliminate the
   * identical boilerplate pattern previously duplicated across five
   * factories.
   */
  private static _simple(
    desc: string,
    resolve: (scope: Scope) => Locator | Promise<Locator>,
  ): By {
    return new By(
      async (scope) => resolve(scope),
      desc,
      async (scope, logger) => {
        const loc = await resolve(scope);
        return By._warnIfAmbiguous(loc, desc, logger);
      },
    );
  }

  /** Match by associated <label> text. */
  static label(text: string): By {
    if (!text?.trim()) throw new Error("By.label(): text must be a non-empty string");
    return By._simple(
      `By.label(${JSON.stringify(text)})`,
      (scope) => scope.getByLabel(text),
    );
  }

  /** Match by ARIA role and optional accessible name / properties. */
  static role(
    role: Parameters<Page["getByRole"]>[0],
    options?: Parameters<Page["getByRole"]>[1],
  ): By {
    const desc = options?.name
      ? `By.role(${JSON.stringify(role)}, { name: ${JSON.stringify(options.name)} })`
      : `By.role(${JSON.stringify(role)})`;
    return By._simple(desc, (scope) => scope.getByRole(role, options));
  }

  /** Match by CSS selector. */
  static css(selector: string): By {
    if (!selector) throw new Error("By.css(): selector must be a non-empty string");
    return By._simple(
      `By.css(${JSON.stringify(selector)})`,
      (scope) => scope.locator(selector),
    );
  }

  /** Match by visible text content. */
  static text(text: string | RegExp): By {
    if (typeof text === "string" && !text.trim()) throw new Error("By.text(): text must be a non-empty string");
    if (text instanceof RegExp) {
      try { new RegExp(text.source, text.flags); } catch (e) {
        throw new Error(`By.text(): invalid RegExp: ${(e as Error).message}`);
      }
    }
    const desc = text instanceof RegExp
      ? `By.text(${text})`
      : `By.text(${JSON.stringify(text)})`;
    return By._simple(desc, (scope) => scope.getByText(text));
  }

  /** Shadow DOM piercing — chained locator calls. */
  static shadow(host: string, inner: string): By {
    if (!host) throw new Error("By.shadow(): host must be a non-empty string");
    if (!inner) throw new Error("By.shadow(): inner must be a non-empty string");
    return By._simple(
      `By.shadow(${JSON.stringify(host)}, ${JSON.stringify(inner)})`,
      (scope) => scope.locator(host).locator(inner),
    );
  }

  /**
   * Scoped lookup — find child within parent.
   */
  static within(parent: By, child: By): By {
    return new By(
      async (scope) => {
        const parentLocator = await By._getRawResolve(parent)(scope);
        return By._getRawResolve(child)(parentLocator);
      },
      `By.within(${parent}, ${child})`,
      async (scope, logger) => {
        const parentLocator = await parent.resolve(scope, logger);
        return child.resolve(parentLocator, logger);
      },
    );
  }

  /**
   * Union match — builds an OR-chain of all `bys` and returns the
   * first match in **DOM order** (not array order). Use this when any
   * match is acceptable regardless of which By produced it.
   *
   * **Important:** "first" here means *closest to the top of the DOM
   * tree*, NOT the first entry in the `bys` array. If `bys[1]` matches
   * an element that appears before `bys[0]`'s match in the DOM,
   * `By.any()` returns `bys[1]`'s element.
   *
   * When exactly one By matches, this correctly acts as a fallback
   * chain. When multiple Bys match different elements, the element
   * closest to the top of the DOM wins — and a console warning is
   * emitted so ambiguity is surfaced.
   *
   * For strict **priority ordering** where array position determines
   * which match wins (regardless of DOM position), use
   * {@link By.first | `By.first()`} instead.
   *
   * ```ts
   * // DOM order wins — if both match, the element nearest <body> is used
   * const by = By.any(By.label("Email"), By.css("#email"));
   * ```
   */
  static any(...bys: [By, ...By[]]): By {

    const desc = `By.any(${bys.join(", ")})`;
    return new By(
      async (scope) => (await By.buildOrChain(bys, scope)).first(),
      desc,
      async (scope, logger) => {
        const combined = await By.buildOrChain(bys, scope);
        // P3-183: Only pay count() overhead when debug logging is enabled.
        if (logger?.debugEnabled) {
          const count = await combined.count();
          if (count > 1) {
            logger.debug(
              `[By.any] Ambiguous match: ${count} elements matched the OR-chain. ` +
              `Returning the first in DOM order. Consider using By.first() for strict priority ordering.`,
            );
          }
        }
        return combined.first();
      },
    );
  }

  /**
   * Priority fallback chain — tries each By in **array order**,
   * returning the first whose locator matches at least one element.
   * Array position determines priority, NOT DOM position.
   *
   * **Important:** Unlike {@link By.any | `By.any()`} (which returns
   * the first match in DOM order), `By.first()` respects the order
   * you pass the strategies in. `By.first(by1, by2)` always prefers
   * `by1` if it matches anything, even if `by2` matches an element
   * that appears earlier in the DOM.
   *
   * **Performance note:** All strategies are resolved in parallel to
   * minimise wall-clock time, so every strategy incurs a resolve +
   * count round-trip even when an earlier one matches. For chains of
   * 2–3 strategies the overhead is negligible; for longer chains
   * consider whether sequential resolution (or a single `By.any()`)
   * would be more efficient.
   *
   * Returns a composable `By` instance like every other factory.
   *
   * ```ts
   * // Array order wins — by1 is always preferred when it matches
   * const by = By.first(by1, by2, by3);
   * button(by, page);                        // composable — strict priority
   * const loc = await by.resolve(page);      // also strict priority
   * ```
   */
  static first(...bys: [By, ...By[]]): By {

    const priorityResolve = async (
      scope: Scope,
      resolveChild: (by: By, s: Scope) => Promise<Locator>,
    ): Promise<Locator> => {
      // Resolve all strategies in parallel, then pick the first (by
      // array index) with count > 0.  This preserves priority ordering
      // while cutting wall-clock time from O(N) to O(1) round-trips —
      // the same pattern used in resolveOnce() (label-resolution.ts).
      const locators = await Promise.all(bys.map((by) => resolveChild(by, scope)));
      const counts = await Promise.all(locators.map((loc) => loc.count()));
      for (let i = 0; i < locators.length; i++) {
        if (counts[i] > 0) return locators[i];
      }
      // Nothing matched — return the OR-chain locator so Playwright's
      // timeout error references all strategies, not just the last one.
      return (await By.buildOrChain(bys, scope)).first();
    };

    const desc = `By.first(${bys.join(", ")})`;
    return new By(
      async (scope) => priorityResolve(scope, (by, s) => By._getRawResolve(by)(s)),
      desc,
      // Strict array-order priority (with probes/logging)
      async (scope, logger) => priorityResolve(scope, (by, s) => by.resolve(s, logger)),
    );
  }
}
