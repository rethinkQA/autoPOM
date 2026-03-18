/**
 * Middleware-related type definitions.
 *
 * Contains the action context, next-function signature,
 * middleware function type, and middleware positioning types
 * used by the middleware pipeline subsystem.
 *
 * This module has no runtime project imports — only type-level
 * imports from external packages (e.g. `@playwright/test`).
 */

import type { Locator, Page } from "@playwright/test";

// ── Middleware ───────────────────────────────────────────────

/** Context passed to each middleware describing the in-flight action. */
export interface ActionContext {
  /** Element type (e.g. "button", "group", "table"). */
  readonly elementType: string;
  /** Method name (e.g. "click", "read", "write"). */
  readonly action: string;
  /** Arguments passed to the method. */
  readonly args: readonly unknown[];
  /**
   * Human-readable descriptor of the `By` locator that created this element,
   * e.g. `'By.label("Email")'`.  Useful for logging and trace correlation.
   * `undefined` for elements not created via a `By` strategy (e.g. table rows).
   */
  readonly by?: string;
  /**
   * Async provider for the Playwright `Locator` being acted on.
   * Middleware can `await context.locator()` to inspect or log the underlying
   * locator without changing the element's lazy-resolution semantics.
   * `undefined` for elements that don't expose a locator provider.
   */
  readonly locator?: () => Promise<Locator>;
  /**
   * Async provider for the Playwright `Page` associated with this element.
   * Middleware can `await context.page()` to hook into page-level events
   * (e.g. network request tracking) without requiring the test author to
   * pass a `Page` reference explicitly.
   *
   * Derived automatically from the element's locator via `locator.page()`.
   * `undefined` for elements that don't expose a locator provider.
   */
  readonly page?: () => Promise<Page>;
  /**
   * Default timeout (ms) configured for this element.
   * Per-call overrides are available in {@link args}.
   */
  readonly timeout?: number;
  /**
   * Timestamp (`Date.now()`) captured when the action was dispatched,
   * before middleware or the action itself runs.  Middleware can compute
   * `Date.now() - context.startTime` for duration tracking.
   */
  readonly startTime: number;
  /**
   * When `true`, forces the action through the middleware pipeline even
   * when called from within an already-middleware-wrapped action (i.e.
   * bypasses the nested-action guard).
   *
   * **Background:** By default, the pipeline uses an `AsyncLocalStorage`
   * flag to detect nested calls within the same async chain.  When
   * action A internally calls action B via `this`, B skips middleware
   * to prevent duplicate logging, retries, and timing data.  This is
   * the correct default for *self-calls* (e.g. `group.writeAll()` →
   * `this.write()`), but it also suppresses middleware for *cross-
   * element* calls that happen in the same async chain (e.g. a
   * middleware that clicks a button and then reads a toast).
   *
   * Set `forceMiddleware: true` on the `ActionContext` to opt out of
   * the guard for a specific invocation.  This is an advanced escape
   * hatch — use it only when you intentionally want the nested action
   * to pass through the full pipeline.
   *
   * @default false
   */
  readonly forceMiddleware?: boolean;
}

/** Call the next middleware in the chain, or the actual action if last. */
export type NextFn = () => Promise<unknown>;

/**
 * A middleware function.
 *
 * Middleware **must** call `next()` and return (or transform) its result.
 * The return type is `Promise<unknown>` because the pipeline erases the
 * concrete action return type at the middleware boundary.  The pipeline
 * validates that the value returned by the outermost middleware is
 * assignment-compatible with the expected action return type at runtime
 * via an explicit cast — see {@link MiddlewarePipeline.runAction}.
 *
 * If a middleware needs to transform the return value, it should
 * `await next()` and return the transformed result.
 */
export interface Middleware {
  (context: ActionContext, next: NextFn): Promise<unknown>;
  /**
   * Optional human-readable name for this middleware.
   *
   * Inline lambdas have no stable identity.  Setting `displayName`
   * provides a stable identifier for debugging, logging, and
   * name-based relative positioning via {@link MiddlewarePosition}.
   *
   * @example
   * ```ts
   * const logger: Middleware = async (ctx, next) => {
   *   console.log(ctx.action);
   *   return next();
   * };
   * logger.displayName = "logger";
   * ```
   */
  displayName?: string;
}

/**
 * Position options for {@link IMiddlewarePipeline.useMiddleware}.
 *
 * Supports both function-reference and name-based relative placement.
 * Name-based placement uses the {@link Middleware.displayName} property,
 * so inline lambdas can be positioned relative to named middleware
 * without holding a reference to the target function.
 */
export type MiddlewarePosition =
  | { before: Middleware | string }  // Insert before the referenced middleware (by ref or displayName)
  | { after: Middleware | string }   // Insert after the referenced middleware (by ref or displayName)
  | "first"                          // Run before all other middlewares
  | "last";                          // Run after all other middlewares (default)
