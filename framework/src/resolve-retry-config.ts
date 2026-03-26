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

import { RESOLVE_TIMEOUT_MS, RESOLVE_RETRY_INTERVALS, getTimeouts } from "./timeouts.js";
import type { IResolveRetryConfig, Logger } from "./types.js";

// ── ResolveRetryConfig class ────────────────────────────────────────

export class ResolveRetryConfig implements IResolveRetryConfig {
  private _getLogger?: () => Logger;
  private _resolveTimeoutMs: number | undefined;
  private _resolveRetryIntervals: readonly number[] | undefined;

  /**
   * Total timeout budget (ms) for `resolveLabeled()`.
   *
   * Reads from (in priority order):
   * 1. Value set via `configureResolveRetry({ timeoutMs })`
   * 2. Value set via `configureTimeouts({ resolveTimeoutMs })`
   * 3. Built-in default (`RESOLVE_TIMEOUT_MS`)
   */
  get resolveTimeoutMs(): number {
    return this._resolveTimeoutMs ?? getTimeouts().resolveTimeoutMs;
  }

  /**
   * Progressive retry interval schedule (ms) passed to
   * `retryUntil({ intervals })`.
   * Once the last entry is reached it repeats until timeout.
   *
   * Reads from (in priority order):
   * 1. Value set via `configureResolveRetry({ intervals })`
   * 2. Value set via `configureTimeouts({ resolveRetryIntervals })`
   * 3. Built-in default (`RESOLVE_RETRY_INTERVALS`)
   */
  get resolveRetryIntervals(): readonly number[] {
    return this._resolveRetryIntervals ?? getTimeouts().resolveRetryIntervals;
  }

  /** Inject a logger provider so warnings flow through the framework Logger. */
  setLoggerProvider(fn: () => Logger): void {
    this._getLogger = fn;
  }

  private _warn(msg: string): void {
    try {
      (this._getLogger?.())?.warn(msg);
    } catch {
      console.warn(msg);
    }
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
    // Validate all fields before mutating any (P2-314: atomic mutation).
    if (opts.timeoutMs !== undefined) {
      if (opts.timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
      if (opts.timeoutMs > 120_000) {
        this._warn(
          `[framework] configureResolveRetry: resolveTimeoutMs (${opts.timeoutMs}) exceeds 120 000 ms. ` +
            `Very large timeouts can cause CI hangs that are expensive and hard to diagnose.`,
        );
      }
    }
    if (opts.intervals !== undefined) {
      if (opts.intervals.length === 0) throw new RangeError("intervals must not be empty");
      if (opts.intervals.some((v) => !(v > 0))) throw new RangeError("All interval values must be positive");
    }

    // All validation passed — now mutate.
    if (opts.timeoutMs !== undefined) {
      this._resolveTimeoutMs = opts.timeoutMs;
    }
    if (opts.intervals !== undefined) {
      this._resolveRetryIntervals = opts.intervals;

      // Warn when intervals are non-monotonically increasing — this
      // usually indicates a misconfiguration (e.g. copy-paste error).
      for (let i = 1; i < opts.intervals.length; i++) {
        if (opts.intervals[i] < opts.intervals[i - 1]) {
          this._warn(
            `[framework] configureResolveRetry: intervals are not monotonically increasing ` +
              `(${opts.intervals.join(", ")}). This is unusual and may indicate a misconfiguration.`,
          );
          break;
        }
      }
    }

    // Warn when the configured timeout doesn't leave room for at least two
    // retry attempts — this usually indicates a misconfiguration.
    const firstInterval = this.resolveRetryIntervals[0];
    if (this.resolveTimeoutMs < firstInterval * 2) {
      this._warn(
        `[framework] configureResolveRetry: resolveTimeoutMs (${this.resolveTimeoutMs}) is less than ` +
          `2× the first retry interval (${firstInterval}). Only one attempt will be possible ` +
          `before timeout — retries are effectively disabled.`,
      );
    }
  }

  /**
   * Reset `resolveLabeled()` retry config to built-in defaults
   * (5 000 ms timeout, [100, 250, 500, 1 000] ms intervals).
   */
  resetResolveRetry(): void {
    this._resolveTimeoutMs = undefined;
    this._resolveRetryIntervals = undefined;
  }
}
