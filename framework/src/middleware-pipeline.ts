/**
 * MiddlewarePipeline — manages the ordered stack of middleware functions
 * that wrap element actions with cross-cutting concerns.
 *
 * Extracted from {@link FrameworkContext} to follow the single-responsibility
 * principle.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionContext, Middleware, MiddlewarePosition } from "./middleware-types.js";
import type { IMiddlewarePipeline } from "./types.js";

// ── MiddlewarePipeline class ────────────────────────────────

export class MiddlewarePipeline implements IMiddlewarePipeline {
  private _middlewares: Middleware[] = [];

  /**
   * Optional provider that returns `true` when debug-level logging is
   * active.  Injected by {@link FrameworkContext} so the pipeline can
   * enable the runtime type-corruption guard without a direct import
   * of the context module (which would create a circular dependency).
   */
  private _debugEnabledProvider?: () => boolean;

  /**
   * Optional provider for emitting warnings through the framework's
   * configurable Logger abstraction.  Injected by {@link FrameworkContext}
   * so that type-corruption warnings are routed through the same
   * channel as all other framework diagnostics.
   * Falls back to `console.warn` when not provided.
   */
  private _warnProvider?: (msg: string) => void;

  constructor(debugEnabledProvider?: () => boolean, warnProvider?: (msg: string) => void) {
    this._debugEnabledProvider = debugEnabledProvider;
    this._warnProvider = warnProvider;
  }

  /**
   * Resolve a middleware reference to an index.
   * Accepts either a function reference or a `displayName` string.
   */
  private _resolveIndex(ref: Middleware | string): number {
    if (typeof ref === "string") {
      return this._middlewares.findIndex(m => m.displayName === ref);
    }
    return this._middlewares.indexOf(ref);
  }

  /**
   * Format a middleware reference for error messages.
   */
  private _formatRef(ref: Middleware | string): string {
    if (typeof ref === "string") return `displayName "${ref}"`;
    return ref.displayName ? `"${ref.displayName}"` : "(anonymous middleware)";
  }

  /**
   * Register a middleware at the given position.
   *
   * **Nested-action guard (P2-128):** When action A triggers action B
   * within the same async call-chain (e.g. `group.writeAll()` calling
   * `handler.set()` for each field), the inner action B **skips** the
   * middleware pipeline to prevent double logging, retries, and timing.
   * This guard is per-async-chain (via `AsyncLocalStorage`), NOT per-element.
   *
   * This means cross-element scenarios (click button A → read toast B)
   * within the same `await` chain also skip middleware for the inner call.
   * To force middleware execution on a nested call, set
   * `forceMiddleware: true` on the inner action's {@link ActionContext}:
   *
   * ```ts
   * // In a custom middleware or action:
   * await runAction({ ...ctx, forceMiddleware: true }, () => el.get());
   * ```
   *
   * @param mw       — The middleware function to register.
   * @param position — Where to insert (`"first"`, `"last"` (default),
   *                   `{ before: ref }`, or `{ after: ref }`).
   *                   References can be a `Middleware` function or a
   *                   `displayName` string.
   */
  useMiddleware(mw: Middleware, position: MiddlewarePosition = "last"): void {
    if (this._middlewares.includes(mw)) {
      throw new Error("useMiddleware: this middleware is already registered.");
    }
    if (position === "first") {
      this._middlewares.unshift(mw);
    } else if (position === "last") {
      this._middlewares.push(mw);
    } else if ("before" in position) {
      const idx = this._resolveIndex(position.before);
      if (idx === -1) {
        throw new Error(
          `useMiddleware: the referenced 'before' middleware (${this._formatRef(position.before)}) is not registered.`,
        );
      }
      this._middlewares.splice(idx, 0, mw);
    } else {
      const idx = this._resolveIndex(position.after);
      if (idx === -1) {
        throw new Error(
          `useMiddleware: the referenced 'after' middleware (${this._formatRef(position.after)}) is not registered.`,
        );
      }
      this._middlewares.splice(idx + 1, 0, mw);
    }
  }

  /** Remove a previously registered middleware. Returns `true` if found. */
  removeMiddleware(mw: Middleware): boolean {
    const idx = this._middlewares.indexOf(mw);
    if (idx >= 0) {
      this._middlewares.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Remove all registered middlewares. */
  clearMiddleware(): void {
    this._middlewares.length = 0;
  }

  /**
   * Run an action through the middleware pipeline.
   *
   * When no middlewares are registered the action runs directly with
   * zero overhead — preserving the natural return type (sync actions
   * stay sync, async actions stay async).
   *
   * When middlewares *are* registered the return is always a
   * `Promise<T>` because the middleware chain is inherently async.
   */
  /**
   * Tracks whether we are currently inside a middleware-wrapped action
   * **per async call-chain**.
   *
   * Uses `AsyncLocalStorage` so that concurrent actions started via
   * `Promise.all` each get their own scope — one action entering the
   * pipeline no longer causes a parallel action to silently skip
   * middleware.
   *
   * **Trade-off:** This flag correctly prevents double-wrapping when
   * an outer action (e.g. `group.writeAll()`) internally calls an
   * inner action (e.g. `handler.set()`) — but it also prevents
   * middleware from firing when an action on element A legitimately
   * triggers an action on element B in the same async chain (e.g. a
   * middleware that clicks a button and then reads a toast).  This is
   * intentional: preventing accidental recursion is safer than allowing
   * it by default.  Callers that need cross-element middleware in a
   * nested context can set `forceMiddleware: true` on the
   * {@link ActionContext} to bypass the guard for that invocation.
   *
   * See `NESTED_ACTION` in `wrap-element.ts` for design rationale.
   */
  private _insideAction = new AsyncLocalStorage<boolean>();

  runAction<T>(
    context: ActionContext,
    action: () => T | Promise<T>,
  ): T | Promise<T> {
    // Fast path: no middleware → preserve the action's natural return.
    if (this._middlewares.length === 0) return action();

    // Nested-call guard: if we are already inside a middleware-wrapped
    // action *in this async chain*, skip the pipeline for the inner
    // call to prevent double logging / retries / timing.
    // The guard can be overridden with `context.forceMiddleware: true`
    // for cross-element scenarios where middleware must fire.
    if (this._insideAction.getStore() && !context.forceMiddleware) return action();

    // Slow path: walk the middleware chain (always async).
    // Snapshot the array so mutations during execution can't invalidate the walk.
    const middlewares = [...this._middlewares];
    let index = 0;

    // When debug mode is active we capture the raw action return value
    // so we can compare it against the pipeline's final result.  The
    // wrapper object avoids ambiguity between "action returned undefined"
    // and "action never ran" (middleware short-circuited).
    //
    // Type-corruption detection always runs (not just in debug mode)
    // because the check is cheap (typeof comparison) and silently
    // corrupted return values are extremely difficult to diagnose in
    // production test suites (#133).
    const debugEnabled = this._debugEnabledProvider?.() ?? false;
    let actionResultRef: { value: unknown } | undefined;

    let actionExecuted = false;
    const next = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        return mw(context, next);
      }
      if (actionExecuted) {
        throw new Error(
          "[framework] Middleware bug: next() called after action already executed. " +
          "A middleware is calling next() more than once.",
        );
      }
      actionExecuted = true;
      // Run the actual action inside an AsyncLocalStorage scope so
      // that any action-method calls made *within* this action (in
      // the same async chain) bypass the pipeline.
      return this._insideAction.run(true, async () => {
        const result = await (action() as Promise<T>);
        actionResultRef = { value: result };
        return result;
      });
    };

    // ── Type-corruption guard ────────────────────────────────
    // Always intercept the middleware chain's resolved value and
    // compare its runtime type against the raw action's return.
    // A middleware that accidentally replaces the return value with
    // an incompatible type (the "type erasure" bug from the
    // `as Promise<T>` cast) is caught here rather than silently
    // corrupting the caller.  In debug mode, the error is thrown;
    // otherwise a warning is emitted via console.warn.
    //
    // The check also runs when the pipeline rejects — a middleware
    // that both corrupts the return value AND throws would otherwise
    // mask the corruption behind the error.
    const checkCorruption = (pipelineResult: unknown): void => {
      if (actionResultRef !== undefined) {
        const actionVal = actionResultRef.value;
        const actionType = actionVal === null ? "null" : typeof actionVal;
        const resultType =
          pipelineResult === null ? "null" : typeof pipelineResult;

        if (actionType !== resultType) {
          const msg =
            `[framework] Middleware type corruption detected: ` +
            `action "${context.action}" on "${context.elementType}" returned ` +
            `type "${actionType}", but the middleware pipeline produced ` +
            `type "${resultType}". A middleware replaced the return value ` +
            `with an incompatible type.`;
          if (debugEnabled) {
            throw new Error(msg);
          }
          (this._warnProvider ?? console.warn)(msg);
        }

        // For object types, also compare constructor names so that
        // e.g. returning a plain object instead of an Array is caught.
        if (
          actionType === "object" &&
          actionVal != null &&
          pipelineResult != null
        ) {
          const actionCtor = (actionVal as object).constructor?.name;
          const resultCtor = (pipelineResult as object).constructor?.name;
          if (actionCtor && resultCtor && actionCtor !== resultCtor) {
            const msg =
              `[framework] Middleware type corruption detected: ` +
              `action "${context.action}" on "${context.elementType}" returned ` +
              `${actionCtor}, but the middleware pipeline produced ` +
              `${resultCtor}. A middleware replaced the return value ` +
              `with an incompatible type.`;
            if (debugEnabled) {
              throw new Error(msg);
            }
            (this._warnProvider ?? console.warn)(msg);
          }
        }
      }
    };

    return next().then(
      (pipelineResult) => {
        // P2-167: Warn when no middleware called next() all the way to the action.
        if (actionResultRef === undefined) {
          const msg =
            `[framework] Middleware short-circuited the action pipeline for ` +
            `"${context.action}" on "${context.elementType}" — did a middleware forget to call next()?`;
          (this._warnProvider ?? console.warn)(msg);
        }
        checkCorruption(pipelineResult);
        return pipelineResult as T;
      },
      (err: unknown) => {
        // P2-100: Skip corruption check on rejection — comparing against
        // `undefined` always produces a false positive for non-void actions.
        throw err;
      },
    ) as Promise<T>;
  }
}
