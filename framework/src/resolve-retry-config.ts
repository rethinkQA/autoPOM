/**
 * ResolveRetryConfig — manages the retry parameters used by
 * `resolveLabeled()` when locating elements by label.
 *
 * Instead of a fixed retry-count × delay budget (which was disconnected
 * from Playwright's timeout settings), the resolution now uses a
 * standalone `retryUntil()` loop with a configurable **timeout** and
 * **interval schedule**.  The caller's per-action timeout takes
 * precedence, falling back to `resolveTimeoutMs` configured here.
 */

// ── Defaults ────────────────────────────────────────────────

/**
 * Default timeout (ms) for element resolution via `resolveLabeled()`.
 * Generous enough for CI and slow renders while still failing fast
 * compared to Playwright's global 30 s default.
 */
const DEFAULT_RESOLVE_TIMEOUT_MS = 5_000;

/**
 * Progressive back-off intervals (ms) used by `retryUntil()`.
 * Starts fast for snappy local dev, then widens for slower CI renders.
 */
const DEFAULT_RETRY_INTERVALS: readonly number[] = [100, 250, 500, 1_000];

import type { IResolveRetryConfig } from "./types.js";

// ── ResolveRetryConfig class ────────────────────────────────

export class ResolveRetryConfig implements IResolveRetryConfig {
  private _resolveTimeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS;
  private _resolveRetryIntervals: readonly number[] = DEFAULT_RETRY_INTERVALS;

  /** Total timeout budget (ms) for `resolveLabeled()`. */
  get resolveTimeoutMs(): number {
    return this._resolveTimeoutMs;
  }

  /**
   * Progressive retry interval schedule (ms) passed to
   * `retryUntil({ intervals })`.
   * Once the last entry is reached it repeats until timeout.
   */
  get resolveRetryIntervals(): readonly number[] {
    return this._resolveRetryIntervals;
  }

  /**
   * Tune the retry behaviour of `resolveLabeled()` at runtime.
   *
   * Useful for slow CI environments where the default timeout or
   * interval schedule may not be appropriate.
   */
  configureResolveRetry(opts: {
    timeoutMs?: number;
    intervals?: number[];
  }): void {
    if (opts.timeoutMs !== undefined) {
      if (opts.timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
      this._resolveTimeoutMs = opts.timeoutMs;
    }
    if (opts.intervals !== undefined) {
      if (opts.intervals.length === 0) throw new RangeError("intervals must not be empty");
      if (opts.intervals.some((v) => v <= 0)) throw new RangeError("All interval values must be positive");
      this._resolveRetryIntervals = opts.intervals;
    }
  }

  /**
   * Reset `resolveLabeled()` retry config to built-in defaults
   * (5 000 ms timeout, [100, 250, 500, 1 000] ms intervals).
   */
  resetResolveRetry(): void {
    this._resolveTimeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS;
    this._resolveRetryIntervals = DEFAULT_RETRY_INTERVALS;
  }
}
