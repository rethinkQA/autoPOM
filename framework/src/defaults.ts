/**
 * Module-level convenience functions that delegate to {@link getActiveContext}.
 *
 * These provide a simpler flat API for users who don't need isolated contexts.
 * Each function forwards directly to the corresponding collaborator on the
 * context returned by `getActiveContext()`.
 *
 * **Important:** `getActiveContext()` resolves using `AsyncLocalStorage`
 * first; if no scoped context is active (e.g. the call happens at
 * module-import time, outside any test fixture), it falls back to the
 * shared global `defaultContext` singleton **and emits a warning**.
 *
 * If you call these functions at the top level of a module (outside a
 * test or fixture callback), you will permanently mutate the global
 * singleton — which may leak state across tests.  Prefer wrapping
 * such calls in `runWithContext()` or using the Playwright fixture
 * for proper isolation.
 *
 * **Pitfall — direct collaborator access bypasses scope guards:**
 * These functions call `checkMutationScope()` before forwarding to
 * the active context.  Calling `ctx.handlers.registerHandler()` (or
 * any collaborator method) directly does **not** invoke the guard.
 * Prefer these flat functions for mutations, or use an isolated
 * context via `createFrameworkContext()` when direct access is needed.
 */

import type { ElementHandler, HandlerPosition } from "./handler-types.js";
import type { ActionContext, Middleware, MiddlewarePosition } from "./middleware-types.js";
import type { Logger, AriaRole } from "./types.js";

import { getActiveContext, checkMutationScope } from "./context.js";

// ── Handler defaults ────────────────────────────────────────

/** @see HandlerRegistry.registerHandler */
export function registerHandler(
  handler: ElementHandler,
  position?: HandlerPosition,
): void {
  checkMutationScope("registerHandler");
  getActiveContext().handlers.registerHandler(handler, position);
}

/** @see HandlerRegistry.unregisterHandler */
export function unregisterHandler(type: string): boolean {
  checkMutationScope("unregisterHandler");
  return getActiveContext().handlers.unregisterHandler(type);
}

/** @see HandlerRegistry.resetHandlers */
export function resetHandlers(): void {
  checkMutationScope("resetHandlers");
  getActiveContext().handlers.resetHandlers();
}

/** @see HandlerRegistry.getHandlerByType */
export function getHandlerByType(type: string): ElementHandler | undefined {
  return getActiveContext().handlers.getHandlerByType(type);
}

/** @see HandlerRegistry.getRoleFallbacks */
export function getRoleFallbacks(): AriaRole[] {
  return getActiveContext().handlers.getRoleFallbacks();
}

/**
 * Return the current handler list from the default context.
 */
export function getHandlers(): readonly ElementHandler[] {
  return getActiveContext().handlers.handlers;
}

// ── Middleware defaults ──────────────────────────────────────

/** @see MiddlewarePipeline.useMiddleware */
export function useMiddleware(mw: Middleware, position?: MiddlewarePosition): void {
  checkMutationScope("useMiddleware");
  getActiveContext().middleware.useMiddleware(mw, position);
}

/** @see MiddlewarePipeline.removeMiddleware */
export function removeMiddleware(mw: Middleware): boolean {
  checkMutationScope("removeMiddleware");
  return getActiveContext().middleware.removeMiddleware(mw);
}

/** @see MiddlewarePipeline.clearMiddleware */
export function clearMiddleware(): void {
  checkMutationScope("clearMiddleware");
  getActiveContext().middleware.clearMiddleware();
}

/**
 * Run an action through the active context's middleware pipeline.
 *
 * **Invariant:** `runAction` is a read-only pass-through — it does
 * not mutate framework state (handlers, middleware list, logger, or
 * retry config) and therefore intentionally does **not** go through
 * {@link checkMutationScope}.  If a future change causes `runAction`
 * to produce side effects, a mutation guard must be added.
 *
 * @see MiddlewarePipeline.runAction
 */
export function runAction<T>(
  context: ActionContext,
  action: () => T | Promise<T>,
): T | Promise<T> {
  return getActiveContext().middleware.runAction(context, action);
}

// ── Logger defaults ─────────────────────────────────────────

/** @see LoggerConfig.configureLogger */
export function configureLogger(logger: Partial<Logger> | null): void {
  checkMutationScope("configureLogger");
  getActiveContext().logger.configureLogger(logger);
}

/** @see LoggerConfig.getLogger */
export function getLogger(): Logger {
  return getActiveContext().logger.getLogger();
}

// ── Resolve-retry defaults ──────────────────────────────────

/** @see ResolveRetryConfig.configureResolveRetry */
export function configureResolveRetry(opts: {
  timeoutMs?: number;
  intervals?: number[];
}): void {
  checkMutationScope("configureResolveRetry");
  getActiveContext().resolveRetry.configureResolveRetry(opts);
}

/** @see ResolveRetryConfig.resetResolveRetry */
export function resetResolveRetry(): void {
  checkMutationScope("resetResolveRetry");
  getActiveContext().resolveRetry.resetResolveRetry();
}

// ── Atomic full reset ───────────────────────────────────────

/**
 * Reset ALL mutable state on the default context in a single call.
 *
 * Equivalent to calling `resetHandlers()`, `clearMiddleware()`,
 * `configureLogger(null)`, and `resetResolveRetry()` individually.
 * Designed for test teardown:
 *
 * ```ts
 * test.afterEach(() => { resetAll(); });
 * ```
 *
 * @see FrameworkContext.reset
 */
export function resetAll(): void {
  checkMutationScope("resetAll");
  getActiveContext().reset();
}

// ── Timeout defaults (P2-227) ────────────────────────────────

import { configureTimeouts as _configureTimeouts, type TimeoutConfig } from "./timeouts.js";

/** @see configureTimeouts in timeouts.ts — wrapped with mutation-scope guard. */
export function configureTimeoutsGuarded(overrides: Partial<TimeoutConfig>): void {
  checkMutationScope("configureTimeouts");
  _configureTimeouts(overrides);
}
