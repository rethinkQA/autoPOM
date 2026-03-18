/**
 * Playwright test fixture that provides automatic per-test context isolation.
 *
 * When `fullyParallel: true` is set in the Playwright config, multiple tests
 * may run concurrently within the same Node.js worker process.  The module-level
 * convenience functions in `defaults.ts` (`registerHandler`, `useMiddleware`,
 * `configureLogger`, etc.) would normally all share the same mutable
 * {@link defaultContext} singleton, creating race conditions between parallel tests.
 *
 * This fixture solves the problem by wrapping each test in an
 * `AsyncLocalStorage` scope with a fresh {@link FrameworkContext}.  All
 * `defaults.ts` functions transparently read from the scoped context via
 * {@link getActiveContext}, so tests get full isolation with **zero code changes**.
 *
 * ## Usage
 *
 * Replace your `@playwright/test` import with this fixture:
 *
 * ```ts
 * // Before
 * import { test, expect } from "@playwright/test";
 *
 * // After
 * import { test, expect } from "../../src/test-fixture.js";
 * ```
 *
 * That's it.  Every test automatically receives an isolated context.  The
 * `afterEach` resets (`resetHandlers()`, `clearMiddleware()`, etc.) are no
 * longer required — each test starts from factory defaults and any mutations
 * are discarded when the scope exits.
 *
 * If you need to access the per-test context object directly (e.g. to pass
 * it to an element factory), use the `ctx` fixture:
 *
 * ```ts
 * test("my test", async ({ ctx }) => {
 *   ctx.handlers.registerHandler(myHandler, "first");
 *   const form = group(By.css("form"), page, { context: ctx });
 * });
 * ```
 */

import { test as base, expect } from "@playwright/test";
import type { IFrameworkContext } from "./types.js";
import {
  createFrameworkContext,
  runWithContext,
  resetWarningState,
  defaultContext,
  getActiveContext,
  setFallbackContext,
} from "./context.js";

// ── Extended fixtures ───────────────────────────────────────

/** Additional fixtures injected by this module. */
export interface ContextFixtures {
  /**
   * A fresh, isolated {@link IFrameworkContext} scoped to the current test.
   *
   * All `defaults.ts` convenience functions (`registerHandler`,
   * `useMiddleware`, `configureLogger`, etc.) automatically target this
   * context for the lifetime of the test — no explicit wiring needed.
   */
  ctx: IFrameworkContext;
}

/**
 * Drop-in replacement for `@playwright/test`'s `test` object with
 * automatic per-test context isolation.
 *
 * ```ts
 * import { test, expect } from "../../src/test-fixture.js";
 * ```
 */
export const test = base.extend<ContextFixtures>({
  // auto: true ensures every test is wrapped in an isolated context,
  // even if the test doesn't explicitly destructure `ctx`.
  ctx: [async ({}, use) => {
    const ctx = createFrameworkContext();

    // Playwright's internal Zone mechanism may prevent AsyncLocalStorage
    // context from propagating through `use()`.  Install the per-test
    // context as a module-level fallback so that `getActiveContext()`
    // returns it even when ALS is not available.  Because Playwright
    // runs at most one test per worker process, a module-level variable
    // is safe — no concurrent interleaving.
    defaultContext.reset();
    setFallbackContext(ctx);

    // Strict context mode is ON by default (see context.ts), so any
    // `getActiveContext()` call that finds neither an ALS scope nor a
    // fallback context throws immediately.  No opt-in required.

    // Run the test inside an AsyncLocalStorage scope so that
    // getActiveContext() returns this isolated context for the
    // entire async lifetime of the test — safe even with
    // fullyParallel: true.
    try {
      await runWithContext(ctx, async () => {
        await use(ctx);

        // ── Post-use ALS propagation assertion ───────────────
        // After the test body has completed, verify the scoped context
        // is still reachable through AsyncLocalStorage.  If Playwright's
        // `use()` broke ALS propagation, `getActiveContext()` would throw
        // (strict mode is on) or return `defaultContext`.  Either way we
        // catch it here as a hard failure so that future runner upgrades
        // or configuration changes that break ALS are surfaced immediately
        // rather than silently sharing mutable state across tests.
        const active = getActiveContext();
        if (active !== ctx) {
          throw new Error(
            "[framework] AsyncLocalStorage context did not propagate through " +
              "Playwright's use() fixture hook. getActiveContext() returned the " +
              "global defaultContext instead of the per-test scoped context. " +
              "Tests are NOT isolated and will share mutable state. " +
              "Check your Playwright version and AsyncLocalStorage compatibility.",
          );
        }
      });
    } finally {
      // Clear the fallback so post-test code (global teardown, etc.)
      // does not accidentally use a stale per-test context.
      setFallbackContext(undefined);

      // Clean up the defaultContext after the test as well, in case
      // ALS didn't propagate and the test mutated the global singleton.
      defaultContext.reset();

      // Reset module-level warning deduplication state so that
      // subsequent tests in the same worker process see warnings
      // for their own issues instead of being silently suppressed.
      resetWarningState();
    }
  }, { auto: true }],
});

export { expect };
