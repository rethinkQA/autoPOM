/**
 * Network-settle middleware — waits for in-flight HTTP requests to
 * complete after write/click actions before continuing.
 *
 * When enabled, every action matching the configured action types
 * (default: `write`, `click`, `writeAll`) will:
 *
 * 1. Start tracking in-flight network requests on the Page.
 * 2. Execute the action via `next()`.
 * 3. Wait until the network is "settled" — no pending requests for
 *    a configurable idle period (`idleTime`).
 *
 * This eliminates the need for manual `page.waitForResponse()` calls
 * after interactions that trigger API calls (e.g. selecting a dropdown
 * that fetches new data, clicking a button that POSTs a form).
 *
 * ## Usage
 *
 * ```ts
 * import { useMiddleware } from "@playwright-elements/core/extend";
 * import { networkSettleMiddleware } from "@playwright-elements/core/network";
 *
 * // Basic — wait for network after every write/click
 * useMiddleware(networkSettleMiddleware());
 *
 * // With options
 * useMiddleware(networkSettleMiddleware({
 *   idleTime: 500,
 *   timeout: 10_000,
 *   actions: ["write", "click"],
 *   ignore: [/analytics/, /tracking/],
 * }));
 * ```
 *
 * @module
 */

import type { Page, Request } from "@playwright/test";
import type { Middleware, ActionContext, NextFn } from "./middleware-types.js";

// ── Configuration ───────────────────────────────────────────

/** Options for {@link networkSettleMiddleware}. */
export interface NetworkSettleOptions {
  /**
   * Milliseconds with zero pending requests before the network is
   * considered "settled".  A shorter value responds faster but is
   * more likely to resolve between rapid-fire requests.
   *
   * @default 300
   */
  idleTime?: number;

  /**
   * Maximum time (ms) to wait for the network to settle.  If the
   * timeout expires, the middleware logs a warning and continues
   * (does **not** throw) so that the test can still proceed.
   *
   * @default 10_000
   */
  timeout?: number;

  /**
   * Action names that trigger network settle waiting.
   * Only actions whose `context.action` is in this list will be
   * monitored.  Other actions pass through without delay.
   *
   * @default ["write", "click", "writeAll"]
   */
  actions?: string[];

  /**
   * URL patterns to ignore when tracking in-flight requests.
   * Requests matching any pattern are excluded from the pending
   * count — useful for analytics, telemetry, polling, or
   * WebSocket upgrade requests that should not block settling.
   *
   * Each entry can be a `RegExp` or a `string` (tested with `url.includes()`).
   */
  ignore?: (RegExp | string)[];

  /**
   * Optional callback fired when a request starts (and is not
   * ignored).  Useful for debug logging.
   */
  onRequest?: (url: string) => void;

  /**
   * Optional callback fired when a request finishes (success or
   * failure).  Useful for debug logging.
   */
  onRequestDone?: (url: string) => void;

  /**
   * Optional callback fired when the timeout expires before the
   * network settles.  Receives the list of still-pending request URLs.
   * Defaults to logging via `warn` (see below) or `console.warn(...)`.
   */
  onTimeout?: (pendingUrls: string[]) => void;

  /**
   * Warning function used for the default timeout message when
   * `onTimeout` is not provided.  Accepts the framework's
   * `Logger.warn` to keep all diagnostics in the configured channel.
   *
   * @default console.warn
   */
  warn?: (msg: string) => void;
}

// ── Default configuration ───────────────────────────────────

import {
  NETWORK_IDLE_TIME_MS,
  NETWORK_SETTLE_TIMEOUT_MS,
  NETWORK_SETTLE_ACTIONS,
} from "./timeouts.js";

// ── Core: waitForNetworkSettle ──────────────────────────────

/**
 * Attach to a Page's request lifecycle events and resolve when no
 * in-flight requests remain for `idleTime` milliseconds.
 *
 * Returns a cleanup function that removes the event listeners and
 * a promise that resolves when the network settles (or the timeout
 * expires).
 */
function trackNetwork(page: Page, opts: Required<Pick<NetworkSettleOptions, "idleTime" | "timeout">> & Pick<NetworkSettleOptions, "ignore" | "onRequest" | "onRequestDone" | "onTimeout" | "warn">) {

  const pending = new Set<Request>();
  let settleResolve: (() => void) | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  /** Whether any (non-ignored) request was observed during tracking. */
  let hadRequests = false;

  /**
   * Whether the action phase is complete. Settlement detection is
   * deferred until after the action so the idle timer cannot fire
   * before the action has a chance to trigger network requests.
   */
  let actionComplete = false;

  function shouldIgnore(url: string): boolean {
    if (!opts.ignore) return false;
    return opts.ignore.some((p) =>
      typeof p === "string" ? url.includes(p) : p.test(url),
    );
  }

  function checkSettle() {
    // Don't begin settlement until the action has finished.
    if (!actionComplete) return;
    if (pending.size === 0 && !settled) {
      // No pending requests — start the idle timer
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        settled = true;
        clearTimeout(timeoutTimer);
        settleResolve?.();
      }, opts.idleTime);
    }
  }

  const onRequest = (req: Request) => {
    const url = req.url();
    if (shouldIgnore(url)) return;
    hadRequests = true;
    pending.add(req);
    opts.onRequest?.(url);
    // Reset idle timer — new activity
    clearTimeout(idleTimer);
  };

  const onRequestDone = (req: Request) => {
    if (!pending.has(req)) return;
    pending.delete(req);
    opts.onRequestDone?.(req.url());
    checkSettle();
  };

  page.on("request", onRequest);
  page.on("requestfinished", onRequestDone);
  page.on("requestfailed", onRequestDone);

  const promise = new Promise<void>((resolve) => {
    settleResolve = resolve;

    // Timeout safety — don't block indefinitely
    timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const pendingUrls = [...pending].map((r) => r.url());
        if (opts.onTimeout) {
          opts.onTimeout(pendingUrls);
        } else {
          const warn = opts.warn ?? console.warn;
          warn(
            `[networkSettleMiddleware] Timed out after ${opts.timeout}ms with ` +
            `${pendingUrls.length} pending request(s):\n` +
            pendingUrls.map((u) => `  • ${u}`).join("\n"),
          );
        }
        resolve();
      }
    }, opts.timeout);

    // NOTE: we intentionally do NOT call checkSettle() here.
    // Settlement is deferred until signalActionComplete() is called
    // so the idle timer cannot fire before the action triggers any
    // network requests.
  });

  /**
   * Signal that the action has completed.  This begins settlement
   * detection: the idle timer starts counting from this point.
   *
   * Two event-loop deferrals (`setTimeout` chained) are used before
   * the first `checkSettle()` call so that any `fetch()` calls
   * triggered synchronously by the action have time to emit their
   * `"request"` event.  A single `setTimeout(0)` was insufficient
   * because Playwright's request-event dispatch can lag by more
   * than one microtask turn — the double deferral gives the event
   * loop enough cycles to process pending I/O callbacks (Issue #137).
   */
  function signalActionComplete() {
    actionComplete = true;
    // If no requests were observed during the action, resolve immediately
    // to avoid the idle wait penalty (P2-178).
    if (!hadRequests && pending.size === 0) {
      settled = true;
      clearTimeout(timeoutTimer);
      settleResolve?.();
      return;
    }
    // Two event-loop turns: first turn processes I/O callbacks from
    // the action (e.g. fetch dispatch); second turn catches any
    // request events queued during the first turn.
    setTimeout(() => setTimeout(() => checkSettle(), 0), 0);
  }

  function cleanup() {
    page.off("request", onRequest);
    page.off("requestfinished", onRequestDone);
    page.off("requestfailed", onRequestDone);
    clearTimeout(idleTimer);
    clearTimeout(timeoutTimer);
    // Resolve the promise if still pending (e.g. action threw before
    // signalActionComplete) to prevent GC-leak of the dangling promise.
    if (!settled) {
      settled = true;
      settleResolve?.();
    }
  }

  return { promise, cleanup, signalActionComplete };
}

// ── Middleware factory ───────────────────────────────────────

/**
 * Create a middleware that waits for the network to settle after
 * every write/click action.
 *
 * @example
 * ```ts
 * // Register globally
 * useMiddleware(networkSettleMiddleware());
 *
 * // With custom options
 * useMiddleware(networkSettleMiddleware({
 *   idleTime: 500,
 *   actions: ["write", "click"],
 *   ignore: [/analytics/, "tracking.js"],
 * }));
 * ```
 */
export function networkSettleMiddleware(
  options?: NetworkSettleOptions,
): Middleware {
  const idleTime = options?.idleTime ?? NETWORK_IDLE_TIME_MS;
  const timeout = options?.timeout ?? NETWORK_SETTLE_TIMEOUT_MS;
  const actions = new Set(options?.actions ?? NETWORK_SETTLE_ACTIONS);
  const ignore = options?.ignore;
  const onRequest = options?.onRequest;
  const onRequestDone = options?.onRequestDone;
  const onTimeout = options?.onTimeout;
  const warn = options?.warn;

  const mw: Middleware = async (
    context: ActionContext,
    next: NextFn,
  ): Promise<unknown> => {
    // Skip non-matching actions
    if (!actions.has(context.action)) {
      return next();
    }

    // Skip if we can't get a Page reference
    if (!context.page) {
      return next();
    }

    let page: Page;
    try {
      page = await context.page();
    } catch {
      // Element not yet attached / page not available — skip gracefully
      return next();
    }

    // Start tracking network before the action executes
    const tracker = trackNetwork(page, {
      idleTime,
      timeout,
      ignore,
      onRequest,
      onRequestDone,
      onTimeout,
      warn,
    });

    try {
      // Execute the actual action
      const result = await next();

      // Signal that the action is done — this starts the idle timer.
      tracker.signalActionComplete();

      // Wait for the network to settle
      await tracker.promise;

      return result;
    } finally {
      tracker.cleanup();
    }
  };

  mw.displayName = "networkSettle";
  return mw;
}
