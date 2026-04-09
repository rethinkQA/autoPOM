/**
 * FrameworkContext — centralised container for all mutable framework state.
 *
 * Instead of module-level singletons (handler registry, middleware stack,
 * logger, resolve-retry config), all mutable state lives in a
 * FrameworkContext instance.  Each Playwright worker (or test) can create
 * its own isolated context, eliminating cross-test state leakage.
 *
 * The four focused collaborators are exposed as read-only properties:
 *
 * | Property             | Class                       |
 * |----------------------|-----------------------------|
 * | `handlers`           | {@link HandlerRegistry}     |
 * | `middleware`          | {@link MiddlewarePipeline}  |
 * | `logger`             | {@link LoggerConfig}        |
 * | `resolveRetry`       | {@link ResolveRetryConfig}  |
 *
 * Callers interact directly with collaborators:
 *
 * ```ts
 * ctx.handlers.registerHandler(customHandler);
 * ctx.middleware.useMiddleware(timingMiddleware);
 * ctx.logger.configureLogger({ warn: myWarn });
 * ```
 *
 * A default global context ({@link defaultContext}) preserves full backward
 * compatibility — the existing module-level functions (`registerHandler`,
 * `useMiddleware`, `configureLogger`, etc.) in `defaults.ts` all delegate
 * to it.
 *
 * ```ts
 * import { createFrameworkContext } from "@framework";
 *
 * // Isolated per-test context
 * const ctx = createFrameworkContext();
 * ctx.middleware.useMiddleware(timingMiddleware);
 * ctx.handlers.registerHandler(customHandler);
 *
 * // Pass to element factories via options
 * const form = group(By.css("form"), page, { context: ctx });
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { HandlerRegistry } from "./handler-registry.js";
import { MiddlewarePipeline } from "./middleware-pipeline.js";
import { LoggerConfig } from "./logger-config.js";
import { ResolveRetryConfig } from "./resolve-retry-config.js";
import { resetRetryablePatterns } from "./playwright-errors.js";
import type { IFrameworkContext } from "./types.js";

// ── FrameworkContext class ───────────────────────────────────

export class FrameworkContext implements IFrameworkContext {
  /** Handler registry — manages element detection and handler lookup. */
  readonly handlers: HandlerRegistry;
  /** Middleware pipeline — wraps element actions with cross-cutting concerns. */
  readonly middleware: MiddlewarePipeline;
  /** Logger configuration — injectable warning/diagnostic logger. */
  readonly logger: LoggerConfig;
  /** Resolve-retry configuration — retry parameters for label resolution. */
  readonly resolveRetry: ResolveRetryConfig;

  constructor() {
    this.logger = new LoggerConfig();
    // HandlerRegistry needs the logger for detectHandler warnings —
    // inject a provider so it always reads the *current* logger.
    this.handlers = new HandlerRegistry(() => this.logger.getLogger());
    this.middleware = new MiddlewarePipeline(
      () => this.logger.getLogger().debugEnabled ?? false,
      (msg) => this.logger.getLogger().warn(msg),
    );
    this.resolveRetry = new ResolveRetryConfig();
    this.resolveRetry.setLoggerProvider(() => this.logger.getLogger());
  }

  // ── Full reset ─────────────────────────────────────────

  /**
   * Reset ALL mutable state to factory defaults in a single call.
   *
   * Equivalent to calling `handlers.resetHandlers()`,
   * `handlers.resetLabelStrategies()`,
   * `middleware.clearMiddleware()`, `logger.configureLogger(null)`,
   * `resolveRetry.resetResolveRetry()`, and `resetRetryablePatterns()`
   * individually. Also resets module-level warning state so that
   * warnings fire again in subsequent tests.
   *
   * Designed for test teardown:
   *
   * ```ts
   * test.afterEach(() => { ctx.reset(); });
   * ```
   */
  reset(): void {
    this.handlers.resetHandlers();
    this.handlers.resetLabelStrategies();
    this.middleware.clearMiddleware();
    this.logger.configureLogger(null);
    this.resolveRetry.resetResolveRetry();
    resetRetryablePatterns();
    resetWarningState();
  }
}

// ── Default context singleton ───────────────────────────────

/**
 * The global default context used by all module-level functions
 * (`registerHandler`, `useMiddleware`, `configureLogger`, etc.)
 * and by element factories when no explicit context is provided.
 *
 * Mutation-scope warnings are implemented in `defaults.ts` via
 * {@link checkMutationScope} rather than a Proxy layer, eliminating
 * per-property-access overhead while preserving the same DX safeguards.
 */
export const defaultContext: IFrameworkContext = new FrameworkContext();

// ── Convenience factory ─────────────────────────────────────

/**
 * Create a new, isolated FrameworkContext.
 *
 * Use this in tests that need isolated state (handler registry,
 * middleware stack, logger, retry config) without affecting the
 * global default context or other tests.
 *
 * ```ts
 * const ctx = createFrameworkContext();
 * ctx.useMiddleware(myMiddleware);
 * const form = group(By.css("form"), page, { context: ctx });
 * ```
 */
export function createFrameworkContext(): IFrameworkContext {
  return new FrameworkContext();
}

// ── Per-test context isolation ───────────────────────────────

/**
 * Async-scoped storage for the active FrameworkContext.
 *
 * Uses `AsyncLocalStorage` so that concurrent tests running with
 * `fullyParallel: true` each get their own context even within
 * a single worker process.  This matches the scoping strategy
 * already used by `MiddlewarePipeline._insideAction`.
 */
const _contextStorage = new AsyncLocalStorage<IFrameworkContext>();

/**
 * When `true` (the **default**), `getActiveContext()` throws instead of
 * returning the global `defaultContext` when called outside an
 * `AsyncLocalStorage` scope.
 *
 * Opt **out** only if you intentionally rely on the global singleton
 * (e.g. a single-test CLI runner with no parallel workers):
 *
 * ```ts
 * setStrictContextMode(false);
 * ```
 */
let _strictContextMode = true;

/**
 * Module-level fallback context for environments where `AsyncLocalStorage`
 * does not propagate through the test runner's fixture hooks (e.g.
 * Playwright's `use()` callback).
 *
 * When the test fixture calls {@link setFallbackContext}, any subsequent
 * {@link getActiveContext} call that finds no ALS scope will return
 * this context instead of throwing or falling back to `defaultContext`.
 *
 * Because Playwright runs at most one test per worker process at a time,
 * a single module-level variable is safe — there is no concurrent
 * interleaving risk.
 */
let _fallbackContext: IFrameworkContext | undefined;

/**
 * Install (or clear) a per-test fallback context.
 *
 * The Playwright fixture calls this before each test so that
 * {@link getActiveContext} can deliver the correct isolated context
 * even when `AsyncLocalStorage` does not propagate through
 * Playwright's `use()` hook.
 *
 * Pass `undefined` to clear the fallback after the test completes.
 */
export function setFallbackContext(ctx: IFrameworkContext | undefined): IFrameworkContext | undefined {
  const prev = _fallbackContext;
  _fallbackContext = ctx;
  return prev;
}

/**
 * Peek at the current AsyncLocalStorage store without any fallback logic.
 *
 * Returns the ALS-stored context if one is active, or `undefined` otherwise.
 * Unlike {@link getActiveContext}, this never throws and never falls back
 * to `_fallbackContext` or `defaultContext`.
 *
 * P2-248: Used by the test fixture to verify ALS propagation without
 * clearing the fallback context (which would create a window where
 * framework code gets "no active context" errors).
 */
export function peekContextStore(): IFrameworkContext | undefined {
  return _contextStorage.getStore();
}

/**
 * Enable or disable strict context mode.
 *
 * When enabled (**default: `true`**), {@link getActiveContext} throws an
 * error instead of silently falling back to the global `defaultContext`
 * when called outside a `runWithContext()` scope.  This catches
 * accidental global mutations (e.g. calls at module-import time) that
 * would otherwise leak state across tests.
 *
 * Call `setStrictContextMode(false)` only if you intentionally rely on
 * the shared global context outside of any `runWithContext()` scope.
 */
export function setStrictContextMode(enabled: boolean): void {
  _strictContextMode = enabled;
}

// ── Mutation-scope guard ─────────────────────────────────────

/** Tracks which mutation warnings have already been emitted (one per operation). */
const _mutationWarned = new Set<string>();

/** Tracks whether the getActiveContext() fallback warning has been emitted. */
let _contextFallbackWarned = false;

/**
 * Reset all module-level warning state so that warnings fire again.
 *
 * Call this between tests (e.g. in `afterEach`) to ensure that
 * cross-test state leakage warnings are not silently suppressed
 * after the first occurrence.
 *
 * The test fixture ({@link test} from `test-fixture.ts`) calls this
 * automatically.
 */
export function resetWarningState(): void {
  _mutationWarned.clear();
  _contextFallbackWarned = false;
}

/**
 * Check whether a state-mutating operation is running outside a
 * `runWithContext()` scope and emit a diagnostic (or throw in strict mode).
 *
 * Called by the convenience functions in `defaults.ts` that delegate to
 * the active context.  Replaces the former Proxy-based guard on
 * `defaultContext`, eliminating per-property-access overhead while
 * preserving the same DX safeguard.
 *
 * When running inside a `runWithContext()` scope, this function is a
 * no-op — the mutation targets the scoped (isolated) context and is safe.
 */
export function checkMutationScope(operation: string): void {
  if (_contextStorage.getStore()) return; // inside an ALS scope — safe
  if (_fallbackContext && _fallbackContext !== defaultContext) return; // inside a fixture fallback — safe

  if (_strictContextMode) {
    throw new Error(
      `[framework] ${operation}() was called outside a runWithContext() scope ` +
        `while strict context mode is enabled. Use runWithContext() or the ` +
        `Playwright fixture for isolated contexts.`,
    );
  }

  if (!_mutationWarned.has(operation)) {
    _mutationWarned.add(operation);
    console.error(
      `[framework] ${operation}() is mutating the shared global context outside ` +
        `a runWithContext() scope. This may cause cross-test state leakage. ` +
        `Use runWithContext() for isolation.`,
    );
  }
}

/**
 * Return the active FrameworkContext.
 *
 * Resolution order:
 * 1. If an `AsyncLocalStorage` scope is active (via {@link runWithContext}),
 *    returns that context.
 * 2. Otherwise, falls back to the module-level {@link defaultContext}
 *    and emits a one-time warning so callers notice they are mutating the
 *    shared global singleton rather than an isolated per-test context.
 *
 * This is the function `defaults.ts` delegates to, making all
 * module-level convenience functions (`registerHandler`,
 * `useMiddleware`, etc.) automatically isolated when tests use
 * the provided Playwright fixture.
 */
export function getActiveContext(): IFrameworkContext {
  const scoped = _contextStorage.getStore();
  if (scoped) return scoped;

  // Fixture-installed fallback for runners where ALS does not
  // propagate through the use() hook (e.g. Playwright).
  if (_fallbackContext) return _fallbackContext;

  // Strict mode: throw instead of silently falling back.
  if (_strictContextMode) {
    throw new Error(
      "[framework] getActiveContext() was called outside an AsyncLocalStorage scope " +
        "while strict context mode is enabled. Wrap your code with runWithContext() " +
        "or use the Playwright fixture to get an isolated context.",
    );
  }

  // P2-219: Falling back to the shared global defaultContext — emit a
  // once-per-reset-cycle warning via stderr.  The boolean flag is reset
  // by resetWarningState() (called between tests by the fixture), so
  // each test independently sees the warning on first occurrence.
  if (!_contextFallbackWarned) {
    _contextFallbackWarned = true;
    console.error(
      "[framework] getActiveContext() was called outside an AsyncLocalStorage scope " +
        "(e.g. outside a test fixture). The shared global defaultContext is being used. " +
        "If this is unintentional, wrap your code with runWithContext() or use the " +
        "Playwright fixture to get an isolated context. " +
        "Strict context mode is ON by default — this path was reached because " +
        "setStrictContextMode(false) was called explicitly.",
    );
  }
  return defaultContext;
}

/**
 * Run a callback within an `AsyncLocalStorage` scope where
 * {@link getActiveContext} returns `ctx`.
 *
 * This is the preferred mechanism for per-test context isolation.
 * All `defaults.ts` convenience functions automatically read from
 * the scoped context for the lifetime of the callback.
 *
 * ```ts
 * await runWithContext(createFrameworkContext(), async (ctx) => {
 *   registerHandler(myHandler);  // mutates the isolated context
 *   await use(ctx);
 * });
 * ```
 */
export function runWithContext<T>(
  ctx: IFrameworkContext,
  fn: (ctx: IFrameworkContext) => T | Promise<T>,
): T | Promise<T> {
  return _contextStorage.run(ctx, () => {
    // ── Runtime ALS propagation assertion ──────────────────
    // Verify the scoped context is actually reachable through
    // AsyncLocalStorage *before* the callback runs.  If Node.js
    // or a platform shim breaks ALS, this fires immediately
    // instead of letting the problem surface as mysterious
    // shared-state corruption later.
    const store = _contextStorage.getStore();
    if (store !== ctx) {
      throw new Error(
        "[framework] runWithContext: AsyncLocalStorage.run() did not make the " +
          "scoped context reachable via getStore(). This indicates a Node.js " +
          "or platform compatibility issue with AsyncLocalStorage. Tests will " +
          "NOT be isolated — all would share the global defaultContext.",
      );
    }
    return fn(ctx);
  });
}


