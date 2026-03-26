/**
 * Element wrapper — intercepts element action methods and routes them
 * through the middleware pipeline of a given {@link FrameworkContext}.
 *
 * Uses a plain object wrapper instead of a Proxy so that wrapped elements
 * are fully inspectable in debuggers (Playwright inspector, WebStorm,
 * VS Code) without Proxy masking.
 *
 * Extracted from `context.ts` so that the wrapping logic lives
 * in its own focused module, separate from the context container itself.
 */

import type { ActionContext } from "./middleware-types.js";
import type { IFrameworkContext } from "./types.js";
import type { Locator, Page } from "@playwright/test";

/**
 * Optional metadata attached to a wrapped element so that
 * {@link ActionContext} can carry richer observability data.
 */
export interface WrapElementMeta {
  /** Human-readable By descriptor, e.g. `'By.label("Email")'`. */
  by?: string;
  /** Async provider for the underlying Playwright Locator. */
  locator?: () => Promise<Locator>;
  /**
   * Async provider for the Playwright Page associated with this element.
   * When not provided, derived from `locator().page()` at call time.
   */
  page?: () => Promise<Page>;
  /** Default timeout (ms) configured at element-creation time. */
  timeout?: number;
  /**
   * When `true`, every action on this element bypasses the nested-action
   * guard and always passes through the full middleware pipeline — even
   * when called from within an already-middleware-wrapped action.
   *
   * This is useful for elements that represent "secondary" targets of a
   * cross-element interaction (e.g. reading a toast after clicking a
   * button) where middleware (logging, timing, retries) should still fire.
   *
   * @default false
   */
  forceMiddleware?: boolean;
}

// ── Action-marking convention ───────────────────────────────

/**
 * Well-known Symbol attached to element objects to declare which methods
 * are **user-facing actions** that should pass through the middleware
 * pipeline (logging, timing, retries, etc.).
 *
 * Methods *not* listed are treated as infrastructure or state queries
 * (e.g. `isVisible`, `waitForHidden`, `locator`, `withTimeout`) and
 * bypass the pipeline entirely.
 *
 * New methods default to *not* being wrapped — a safe default that
 * avoids silent middleware noise for utility helpers.
 *
 * ### Usage
 *
 * **Preferred — pass `actions` to `wrapElement`** (used by all
 * built-in element factories):
 *
 * ```ts
 * return wrapElement("button", element, ctx, ["click", "read"]);
 * ```
 *
 * **Alternative — set the symbol directly** (useful for custom
 * element wrappers that don't call `wrapElement`):
 *
 * ```ts
 * (element as any)[ACTIONS] = new Set(["click", "read"]);
 * ```
 */
export const ACTIONS: unique symbol = Symbol("framework.actions");

// ── Nested-action design rationale ──────────────────────────
//
// When an action method (e.g. `read()`) internally calls another
// action (e.g. `isChecked()`), both calls would normally trigger
// the full middleware pipeline — duplicated logs, double retries,
// and misleading timing.  The pipeline sets a per-async-chain flag
// (`AsyncLocalStorage<boolean>` inside `MiddlewarePipeline._insideAction`)
// before entering the middleware chain and checks it on re-entry;
// if already set, the nested call bypasses middleware.
//
// **Trade-off:** The guard is per-async-chain, not per-element.
// Cross-element calls within the same chain also bypass middleware.
// Set `forceMiddleware: true` on the `ActionContext` to override
// the guard for a specific invocation.

// ── Legacy blocklist (backward compat) ──────────────────────

// ── wrapElement ─────────────────────────────────────────────

/**
 * Wrap an element object so every action method passes through the
 * middleware pipeline of the given context (or the default context).
 *
 * **How wrapping is decided:**
 *
 * 1. Non-function properties are always returned as-is.
 * 2. Only methods listed in the {@link ACTIONS} allowlist (via the
 *    `actions` parameter or the `ACTIONS` symbol) pass through the
 *    middleware pipeline. All other methods are returned unwrapped.
 *
 * **Post-construction immutability:** The returned element is frozen
 * via `Object.freeze()`.  All properties and methods must be defined
 * before `wrapElement` is called — no properties can be added,
 * removed, or reassigned after wrapping.  This prevents a class of
 * subtle bugs where extension authors add methods to an element
 * after wrapping, bypassing the middleware pipeline, or where a
 * later `Object.defineProperty` doesn't propagate to the internal
 * `this` binding used by wrapped action methods.
 *
 * @param elementType - Identifier shown in {@link ActionContext.elementType}.
 * @param element - The raw element object returned by a factory.
 * @param ctx - The {@link IFrameworkContext} whose middleware pipeline wraps actions.
 * @param actions - Allowlist of method names that are user-facing actions.
 *   When provided, the set is attached to `element` via the {@link ACTIONS}
 *   symbol and only these methods pass through the middleware pipeline.
 * @returns A frozen proxy of the same element with middleware-aware methods.
 */
export function wrapElement<T extends Record<string, unknown>>(
  elementType: string,
  element: T,
  ctx: IFrameworkContext,
  actions?: readonly (keyof T & string)[],
  meta?: WrapElementMeta,
): T {
  if (!elementType?.trim()) {
    throw new RangeError("wrapElement: elementType must be a non-empty string");
  }
  // Attach ACTIONS metadata when the caller supplies an explicit allowlist.
  if (actions) {
    Object.defineProperty(element, ACTIONS, {
      value: new Set(actions),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  const fwCtx = ctx;

  // Read the ACTIONS allowlist from the element (set via parameter
  // above, or attached directly by the caller).
  const actionSet = (element as Record<symbol, unknown>)[ACTIONS] as
    | ReadonlySet<string>
    | undefined;

  // If no actions are declared, nothing needs wrapping — return as-is.
  if (!actionSet || actionSet.size === 0) {
    return element;
  }

  // Validate that every declared action actually exists as a function
  // on the element.  Catches typos (e.g. "raed" instead of "read")
  // at element-creation time rather than letting them silently run
  // unwrapped with no middleware.
  for (const name of actionSet) {
    if (typeof (element as Record<string, unknown>)[name] !== "function") {
      const available = Object.keys(element)
        .filter((k) => typeof (element as Record<string, unknown>)[k] === "function")
        .join(", ");
      throw new Error(
        `wrapElement("${elementType}"): action "${name}" is not a function on the element. ` +
          `Available methods: [${available}]`,
      );
    }
  }

  // ── Plain wrapper object ──────────────────────────────────
  //
  // Instead of a Proxy we create a regular object with the same
  // properties.  Action methods are routed through the middleware
  // pipeline; everything else is copied unmodified.
  //
  // Benefits over a Proxy:
  //   • Fully inspectable in debuggers (Playwright inspector,
  //     WebStorm, VS Code) — no Proxy masking of the native object
  //   • Cleaner stack traces
  //   • Properties appear as real own properties
  //
  // All element objects produced by the framework's built-in
  // factories are plain object literals (not class instances), so
  // prototype-chain inheritance is unnecessary.  A simple spread
  // copies every enumerable own property, and `defineProperty`
  // overwrites only the action methods that need middleware wrapping.
  const wrapped: Record<string | symbol, unknown> = { ...element };

  // P3-235: Copy the ACTIONS symbol explicitly — spread only copies
  // enumerable own properties and ACTIONS is non-enumerable.
  if (actionSet) {
    Object.defineProperty(wrapped, ACTIONS, {
      value: actionSet,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  for (const key of Object.keys(element)) {
    const value = (element as Record<string, unknown>)[key];

    if (
      typeof value === "function" &&
      actionSet.has(key)
    ) {
      // Wrap action method through the middleware pipeline.
      // `this` is bound to `wrapped` so that internal
      // `this.someMethod()` calls within element methods still
      // resolve to the wrapped version.
      //
      // NESTED-ACTION GUARD: The MiddlewarePipeline structurally
      // prevents double-wrapping.  If action A calls action B via
      // `this`, only A's invocation passes through middleware; B's
      // call bypasses the pipeline automatically (see
      // MiddlewarePipeline._insideAction via AsyncLocalStorage).
      const actionName = key;
      const fn = value as (...a: unknown[]) => unknown;
      Object.defineProperty(wrapped, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: function (...args: unknown[]) {
          // Derive page provider: prefer explicit meta.page, fall back
          // to resolving from the locator via locator.page().
          const pageProvider = meta?.page ?? (meta?.locator
            ? async () => (await meta!.locator!()).page()
            : undefined);
          const actionCtx: ActionContext = {
            elementType,
            action: actionName,
            args,
            by: meta?.by,
            locator: meta?.locator,
            page: pageProvider,
            timeout: meta?.timeout,
            startTime: Date.now(),
            ...(meta?.forceMiddleware ? { forceMiddleware: true } : undefined),
          };
          // Let runAction preserve the natural return type:
          // sync actions stay sync (when no middleware), async
          // actions stay async.  No forced Promise.resolve().
          return fwCtx.middleware.runAction(actionCtx, () => fn.apply(wrapped, args));
        },
      });
    }
    // Non-action properties are already on `wrapped` via the spread.
  }

  // Debug-friendly tag visible in console / inspector output.
  Object.defineProperty(wrapped, Symbol.toStringTag, {
    value: `FrameworkElement<${elementType}>`,
    enumerable: false,
    configurable: false,
  });

  // Freeze the wrapped object to enforce the no-post-construction-mutation
  // invariant.  All element factories define every property upfront, so
  // this is safe for built-in elements.  Extension authors who build
  // custom elements must also define everything before calling wrapElement.
  //
  // **Custom handler state:** Because the returned element is frozen,
  // custom handlers that need to store per-element state should use a
  // WeakMap keyed by the element's underlying Locator:
  //
  //   const handlerState = new WeakMap<Locator, MyState>();
  //   // in set(): handlerState.set(el.locator, { ... });
  //   // in get(): handlerState.get(el.locator);
  //
  // Attempting to assign properties on a frozen element will silently
  // fail in sloppy mode or throw TypeError in strict mode.
  Object.freeze(wrapped);

  return wrapped as T;
}
