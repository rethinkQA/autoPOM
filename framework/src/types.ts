/**
 * Core framework contracts — Logger, AriaRole, collaborator interfaces,
 * and the central {@link IFrameworkContext} contract.
 *
 * This module owns **only** the abstract interfaces and types that
 * define the framework's dependency-inversion boundaries.  It does
 * **not** re-export symbols from other type modules.
 *
 * Import guidelines:
 *
 * | You need…                        | Import from            |
 * |----------------------------------|------------------------|
 * | Handler types (ElementHandler…)  | `handler-types.ts`     |
 * | Middleware types (ActionContext…) | `middleware-types.ts`   |
 * | Framework contracts (IFramework… | **this file** (`types`) |
 *
 * Dependency DAG (no cycles):
 *
 *   handler-types  ←  types  →  middleware-types
 */

import type { Locator } from "@playwright/test";

// ── Import types needed by interfaces below ─────────────────

import type { ElementHandler, HandlerPosition } from "./handler-types.js";
import type { ActionContext, Middleware, MiddlewarePosition } from "./middleware-types.js";

// ── Logger ──────────────────────────────────────────────────

export interface Logger {
  /** Warning-level messages (ambiguous matches, suspicious patterns). */
  warn(message: string): void;
  /** Debug-level messages (trace diagnostics, handler detection, retry attempts, resolution steps). */
  debug(message: string): void;
  /**
   * Whether debug-level logging is active.
   *
   * When `false` (the default), expensive diagnostic probes — such as
   * the ambiguity `count()` check in `By` resolution — are skipped
   * entirely, eliminating an extra browser round-trip on every locate.
   *
   * Set automatically by {@link LoggerConfig} when a custom `debug`
   * function is provided via `configureLogger()`.
   */
  readonly debugEnabled?: boolean;
}

// ── Collaborator interfaces ─────────────────────────────────
// Used by IFrameworkContext so consumers depend on abstractions
// rather than concrete classes.

/** ARIA role type extracted from Playwright's Locator.getByRole(). */
export type AriaRole = Parameters<Locator["getByRole"]>[0];

/**
 * Abstract contract for the handler registry.
 *
 * Consumers depend on this interface rather than the concrete
 * {@link HandlerRegistry} class, enabling lightweight fakes in
 * unit tests and full inversion of control.
 */
export interface IHandlerRegistry {
  /** Public read-only view of the registered handlers. */
  readonly handlers: readonly ElementHandler[];
  /** Register a custom handler at runtime. */
  registerHandler(handler: ElementHandler, position?: HandlerPosition): void;
  /** Look up a registered handler by its `type` name. */
  getHandlerByType(type: string): ElementHandler | undefined;
  /** Remove a handler by its `type` name. Returns `true` if found and removed. */
  unregisterHandler(type: string): boolean;
  /** Restore the handler registry to its built-in defaults. */
  resetHandlers(): void;
  /** Classify a DOM element and return the matching handler. */
  detectHandler(
    el: Locator,
    options?: { fallback?: boolean },
  ): Promise<ElementHandler>;
  /** Compute the role-fallback list from the current handler registry. */
  getRoleFallbacks(): AriaRole[];
}

/**
 * Abstract contract for the middleware pipeline.
 *
 * Consumers depend on this interface rather than the concrete
 * {@link MiddlewarePipeline} class.
 */
export interface IMiddlewarePipeline {
  /** Register a middleware at the given position (default `"last"`). */
  useMiddleware(mw: Middleware, position?: MiddlewarePosition): void;
  /** Remove a previously registered middleware. Returns `true` if found. */
  removeMiddleware(mw: Middleware): boolean;
  /** Remove all registered middlewares. */
  clearMiddleware(): void;
  /** Run an action through the middleware pipeline. */
  runAction<T>(
    context: ActionContext,
    action: () => T | Promise<T>,
  ): T | Promise<T>;
}

/**
 * Abstract contract for the logger configuration.
 *
 * Consumers depend on this interface rather than the concrete
 * {@link LoggerConfig} class.
 */
export interface ILoggerConfig {
  /** Replace the framework's logger (pass `null` to reset to defaults). */
  configureLogger(logger: Partial<Logger> | null): void;
  /** Return the active logger instance. */
  getLogger(): Logger;
}

/**
 * Abstract contract for the resolve-retry configuration.
 *
 * Consumers depend on this interface rather than the concrete
 * {@link ResolveRetryConfig} class.
 */
export interface IResolveRetryConfig {
  /** Total timeout budget (ms) for `resolveLabeled()`. */
  readonly resolveTimeoutMs: number;
  /** Progressive retry interval schedule (ms). */
  readonly resolveRetryIntervals: readonly number[];
  /** Tune the retry behaviour of `resolveLabeled()` at runtime. */
  configureResolveRetry(opts: {
    timeoutMs?: number;
    intervals?: number[];
  }): void;
  /** Reset retry config to built-in defaults. */
  resetResolveRetry(): void;
}

// ── Framework context interface ─────────────────────────────

/**
 * Abstract contract for the framework context.
 *
 * All consumers — `resolveLabeled()`, `buildGroupElement()`,
 * `ElementOptions`, `wrapElement()`, etc. — depend on this interface
 * rather than the concrete {@link FrameworkContext} class.  This
 * enables lightweight fakes in unit tests, read-only context variants,
 * and evolving the internal shape without touching every consumer.
 */
export interface IFrameworkContext {
  /** Handler registry — manages element detection and handler lookup. */
  readonly handlers: IHandlerRegistry;
  /** Middleware pipeline — wraps element actions with cross-cutting concerns. */
  readonly middleware: IMiddlewarePipeline;
  /** Logger configuration — injectable warning/diagnostic logger. */
  readonly logger: ILoggerConfig;
  /** Resolve-retry configuration — retry parameters for label resolution. */
  readonly resolveRetry: IResolveRetryConfig;

  /**
   * Reset ALL mutable state to factory defaults in a single atomic call.
   *
   * Equivalent to calling `handlers.resetHandlers()`,
   * `middleware.clearMiddleware()`, `logger.configureLogger(null)`,
   * and `resolveRetry.resetResolveRetry()` individually.
   */
  reset(): void;
}
