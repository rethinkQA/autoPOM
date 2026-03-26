/**
 * Base builder utilities shared by every typed element wrapper.
 *
 * Internal — not re-exported from elements/index.ts.
 * These helpers are implementation plumbing for element wrappers,
 * not part of the public API.
 *
 * Centralises the boilerplate that was previously copy-pasted across
 * all 12+ element factory functions:
 *
 *   • `loc()` — lazy Playwright Locator resolution
 *   • `t(options)` — effective timeout (per-call → builder-default → undefined)
 *   • `withTimeout(ms)` — re-create the element with a new default timeout
 *   • `locator()` — expose the underlying Playwright Locator
 *
 * To add a method that should be available on **every** element type
 * (e.g. `waitForAttached()`), add it here once.
 */

import { By, type Scope } from "../by.js";
import type { IFrameworkContext } from "../types.js";
import { getActiveContext } from "../context.js";
import type { Locator } from "@playwright/test";
import type { ActionOptions, ElementHandler } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import type { WrapElementMeta } from "../wrap-element.js";

/** Common element surface that every typed wrapper exposes. */
export interface BaseElement<T> {
  waitForVisible(options?: ActionOptions): Promise<void>;
  waitForHidden(options?: ActionOptions): Promise<void>;
  isVisible(options?: ActionOptions): Promise<boolean>;
  isDisabled(options?: ActionOptions): Promise<boolean>;
  withTimeout(ms: number): T;
  locator(): Promise<Locator>;
}

// ── createBaseElement (single source of truth) ──────────────

/**
 * Create the `BaseElement<T>` surface from a locator-provider function.
 *
 * This is the **single** implementation of common element methods
 * (`waitForVisible`, `waitForHidden`, `isVisible`, `isDisabled`,
 * `withTimeout`, `locator`).  {@link buildElement} and
 * {@link buildElementFromProvider} delegate here so the logic is never duplicated.
 */
function createBaseElement<T>(
  locProvider: () => Locator | Promise<Locator>,
  rebuild: (ms: number) => T,
  defaultTimeout?: number,
): BaseElement<T> {
  const getLoc = async () => locProvider();
  const t = (options?: ActionOptions) => options?.timeout ?? defaultTimeout;

  return {
    async waitForVisible(options?: ActionOptions) {
      const el = await getLoc();
      await el.waitFor({ state: "visible", timeout: t(options) });
    },
    async waitForHidden(options?: ActionOptions) {
      const el = await getLoc();
      await el.waitFor({ state: "hidden", timeout: t(options) });
    },
    async isVisible(options?: ActionOptions) {
      const el = await getLoc();
      return el.isVisible({ timeout: t(options) });
    },
    async isDisabled(options?: ActionOptions) {
      const el = await getLoc();
      return el.isDisabled({ timeout: t(options) });
    },
    withTimeout(ms: number): T {
      return rebuild(ms);
    },
    async locator(): Promise<Locator> {
      return getLoc();
    },
  };
}

// ── buildElement (standard element factories) ───────────────

/**
 * Shared infrastructure returned by {@link buildElement}.
 *
 * Every standard element factory destructures this to get `loc`, `t`,
 * and `base` — a single source of truth for locator resolution,
 * timeout computation, and the common `BaseElement` surface.
 */
export interface ElementInfra<T> {
  /** Lazily resolve the underlying Playwright Locator. */
  loc(): Promise<Locator>;
  /** Effective timeout: per-call override → builder default → undefined. */
  t(options?: ActionOptions): number | undefined;
  /** Base methods (`waitForVisible`, `isDisabled`, `withTimeout`, …). */
  base: BaseElement<T>;
  /** Resolved framework context (never undefined). */
  ctx: IFrameworkContext;
  /** Metadata for enriching {@link ActionContext} in the middleware pipeline. */
  meta: WrapElementMeta;
}

/**
 * Build the full shared infrastructure for a standard element factory.
 *
 * Constructs a locator-provider from `By` + `Scope` and delegates to
 * {@link createBaseElement} for the common `BaseElement<T>` surface.
 *
 * ```ts
 * export function button(by: By, scope: Scope, options?: ElementOptions): ButtonElement {
 *   const { loc, t, base, ctx } = buildElement<ButtonElement>(by, scope, options,
 *     (ms) => button(by, scope, { ...options, timeout: ms }));
 *
 *   return wrapElement("button", {
 *     ...base,
 *     async click(opts?) { await (await loc()).click({ timeout: t(opts) }); },
 *   }, ctx, ["click"]);
 * }
 * ```
 *
 * **Convention — spread ordering:**
 * Always spread `base` **first** in the object literal, then declare
 * element-specific methods after it. This guarantees that
 * element-specific overrides (e.g. a custom `isVisible` in toast)
 * always win, because later properties in a spread silently replace
 * earlier ones with the same key.
 */
export function buildElement<T>(
  by: By,
  scope: Scope,
  options: ElementOptions | undefined,
  rebuild: (ms: number) => T,
): ElementInfra<T> {
  const defaultTimeout = options?.timeout;
  if (defaultTimeout !== undefined && (!Number.isFinite(defaultTimeout) || defaultTimeout < 0)) {
    throw new RangeError(`ElementOptions.timeout must be a finite non-negative number, got ${defaultTimeout}`);
  }
  const resolvedCtx = (options?.context ?? getActiveContext());
  const loc = () => by.resolve(scope, resolvedCtx.logger.getLogger());
  const t = (opts?: ActionOptions) => opts?.timeout ?? defaultTimeout;

  return {
    loc,
    t,
    base: createBaseElement<T>(loc, rebuild, defaultTimeout),
    ctx: resolvedCtx,
    meta: {
      by: by.toString(),
      locator: loc,
      timeout: defaultTimeout,
    },
  };
}

// ── Timeout-only helper ─────────────────────────────────────

/**
 * Look up a handler by type name from the active registry, or throw.
 *
 * Used by typed element wrappers to delegate interaction logic to the
 * handler registry instead of reimplementing it inline.  This ensures
 * that `registerHandler()` / `unregisterHandler()` customisations are
 * respected by both `group.write()` **and** typed wrappers like
 * `checkbox().check()`.
 *
 * The lookup happens at **method call time** (not construction time),
 * so runtime handler replacements take effect immediately.
 */
export function requireHandler(ctx: IFrameworkContext, type: string): ElementHandler {
  const handler = ctx.handlers.getHandlerByType(type);
  if (!handler) {
    throw new Error(
      `No handler with type "${type}" found in the handler registry. ` +
      `The handler may have been unregistered. ` +
      `Registered types: ${ctx.handlers.handlers.map(h => h.type).join(", ")}.`,
    );
  }
  return handler;
}

/**
 * Create a standalone timeout resolver.
 *
 * @deprecated This function is unused — `buildElement` and
 * `buildElementFromProvider` inline the same logic directly.
 * Kept for backward compatibility with external consumers.
 *
 * @internal
 */
export function resolveTimeout(
  defaultTimeout?: number,
): (options?: ActionOptions) => number | undefined {
  return (options?: ActionOptions) => options?.timeout ?? defaultTimeout;
}

// ── buildElementFromProvider (locator-provider variant) ──────

/** Options for building element infra from a pre-resolved locator provider. */
export interface BuildFromProviderOptions<T> {
  /** Async or sync function that returns the underlying Playwright Locator. */
  locProvider: () => Locator | Promise<Locator>;
  /** Factory for `withTimeout()` — re-creates the element with a new default. */
  rebuild: (ms: number) => T;
  defaultTimeout?: number;
  /** Framework context — defaults to the active context if omitted. */
  context?: IFrameworkContext;
  /** Human-readable By descriptor, e.g. `'By.label("Email")'`. */
  byDescriptor?: string;
}

/**
 * Build the full shared infrastructure for an element factory that uses
 * a pre-resolved locator provider instead of `By` + `Scope`.
 *
 * This is the locator-provider counterpart to {@link buildElement} —
 * element factories that receive their locator dynamically (e.g.
 * `buildGroupElement`, scoped groups from `find()`) use this to get
 * the same {@link ElementInfra} wiring that every standard element
 * factory gets from `buildElement`.
 *
 * ```ts
 * const infra = buildElementFromProvider<GroupElement>({
 *   locProvider: getLoc,
 *   rebuild: (ms) => buildGroupElement(getLoc, ms, overrides, ctx),
 *   defaultTimeout,
 *   context: ctx,
 *   byDescriptor,
 * });
 * ```
 */
export function buildElementFromProvider<T>(
  opts: BuildFromProviderOptions<T>,
): ElementInfra<T> {
  if (opts.defaultTimeout !== undefined && (!Number.isFinite(opts.defaultTimeout) || opts.defaultTimeout < 0)) {
    throw new RangeError(`ElementOptions.timeout must be a finite non-negative number, got ${opts.defaultTimeout}`);
  }
  const resolvedCtx = opts.context ?? getActiveContext();
  const loc = async () => opts.locProvider();
  const t = (o?: ActionOptions) => o?.timeout ?? opts.defaultTimeout;

  return {
    loc,
    t,
    base: createBaseElement<T>(opts.locProvider, opts.rebuild, opts.defaultTimeout),
    ctx: resolvedCtx,
    meta: {
      by: opts.byDescriptor,
      locator: loc,
      timeout: opts.defaultTimeout,
    },
  };
}


