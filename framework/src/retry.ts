/**
 * Standalone retry utility — replaces `expect().toPass()` so the
 * framework has no runtime dependency on the Playwright *test runner*.
 *
 * Uses the same progressive back-off semantics that
 * `ResolveRetryConfig` already exposes: a finite list of intervals
 * where the last entry repeats until the timeout budget is exhausted.
 */

export interface RetryOptions {
  /** Total timeout budget in milliseconds. */
  timeout: number;
  /**
   * Progressive back-off intervals (ms).
   * Once the last entry is reached it repeats until timeout.
   */
  intervals: readonly number[];
}

// ── Result-based retry ──────────────────────────────────────

/**
 * Discriminated-union result returned by a retry callback.
 *
 * - `ok`    — success; the retry loop returns `value`.
 * - `retry` — transient failure; the loop sleeps and tries again.
 * - `fail`  — non-transient failure; the loop throws `error` immediately.
 */
export type RetryResult<T> =
  | { ok: true; value: T }
  | { ok: false; retryable: true;  error: unknown }
  | { ok: false; retryable: false; error: unknown };

/**
 * Execute `fn` repeatedly until it returns `{ ok: true }`.
 *
 * Accepts a **result-returning** callback — no exception-based control
 * flow required.  Transient failures (`retryable: true`) are retried
 * with progressive back-off; non-transient failures (`retryable: false`)
 * cause an immediate throw of the enclosed error.
 *
 * If the callback keeps returning retryable failures past the timeout
 * budget, the **last** error is re-thrown to the caller.
 */
export async function retryUntil<T>(
  fn: () => Promise<RetryResult<T>>,
  opts: RetryOptions,
): Promise<T> {
  const { timeout, intervals } = opts;
  const deadline = Date.now() + timeout;
  let attempt = 0;
  let lastError: unknown;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let nonRetryableError: unknown = undefined;
    let hasNonRetryable = false;

    try {
      const result = await fn();

      if (result.ok) return result.value;

      if (!result.retryable) {
        nonRetryableError = result.error;
        hasNonRetryable = true;
      } else {
        lastError = result.error;
      }
    } catch (err) {
      lastError = err;
    }

    // Non-retryable errors must propagate immediately — outside the
    // try/catch so they are not swallowed by the catch block.
    if (hasNonRetryable) throw nonRetryableError;

    // Check if we've exhausted the budget *after* the failed attempt.
    if (Date.now() >= deadline) break;

    // Pick the next interval — stick with the last one once exhausted.
    const interval = intervals[Math.min(attempt, intervals.length - 1)] ?? intervals[intervals.length - 1] ?? 100;

    // Don't sleep past the deadline.
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    await sleep(Math.min(interval, remaining));
    attempt++;
  }

  // Budget exhausted — propagate the last error.
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
