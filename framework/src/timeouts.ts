/**
 * Named constants for timeouts and retry limits used across the framework.
 *
 * Centralised here so that:
 * 1. Every magic number has a descriptive name.
 * 2. Tuning values is a single-file change.
 * 3. Reviewers can audit timing behaviour in one place.
 * 4. Consumers can override values at runtime via {@link configureTimeouts}.
 *
 * @module
 */

// ── Default values ──────────────────────────────────────────

// ── Toggle (checkbox / switch) ──────────────────────────────

/**
 * Timeout (ms) for the *first* check/uncheck attempt before falling
 * back to `force: true`.  Kept short so the force-click fallback
 * kicks in quickly for shadow-DOM overlays (Shoelace, etc.).
 */
export const TOGGLE_FIRST_ATTEMPT_MS = 2_000;

// ── Non-editable select / combobox ──────────────────────────

/** Timeout (ms) for clicks that open or select within a dropdown. */
export const SELECT_CLICK_TIMEOUT_MS = 3_000;

/**
 * Maximum retry iterations when waiting for a dropdown option to appear.
 *
 * Higher than combobox (15 vs 10) because non-editable selects depend on
 * portal mounting and framework-specific render cycles (Lit requestUpdate,
 * Angular change detection) that can take more iterations to settle.
 */
export const SELECT_MAX_RETRIES = 15;

/**
 * Delay (ms) between retry iterations while waiting for dropdown
 * options to render (portal mounting, Lit requestUpdate, etc.).
 */
export const SELECT_RETRY_DELAY_MS = 150;

/**
 * Deadline (ms) for polling `aria-expanded="true"` after clicking
 * a non-editable select to open the dropdown.
 */
export const SELECT_EXPAND_DEADLINE_MS = 2_000;

/**
 * Timeout (ms) for waiting for the first `role="option"` to become
 * visible after the dropdown reports itself as expanded.
 */
export const SELECT_OPTION_VISIBLE_MS = 1_000;

// ── Editable combobox (hybrid) ──────────────────────────────

/**
 * Maximum retry iterations for the hybrid editable combobox handler.
 *
 * Lower than non-editable select (10 vs 15) because editable comboboxes
 * filter options client-side after typing, which is faster than waiting
 * for portal-mounted dropdowns to render.
 */
export const COMBOBOX_MAX_RETRIES = 10;

/** Delay (ms) between retries while finding a matching option. */
export const COMBOBOX_RETRY_DELAY_MS = 100;

// ── Polling ─────────────────────────────────────────────────

/**
 * Interval (ms) for lightweight attribute-polling loops
 * (e.g. waiting for `aria-expanded` to flip).
 */
export const POLL_INTERVAL_MS = 50;

// ── Dialog / overlay close ──────────────────────────────────

/**
 * Timeout (ms) for waiting for a dialog or overlay to close
 * after triggering a close action (Escape, close button, etc.).
 */
export const DIALOG_CLOSE_TIMEOUT_MS = 5_000;

// ── Element resolution ──────────────────────────────────────

/**
 * Default timeout (ms) for element resolution via `resolveLabeled()`.
 * Generous enough for CI and slow renders while still failing fast
 * compared to Playwright's global 30 s default.
 */
export const RESOLVE_TIMEOUT_MS = 5_000;

/**
 * Progressive back-off intervals (ms) used by `retryUntil()` during
 * label resolution.  Starts fast for snappy local dev, then widens
 * for slower CI renders.
 */
export const RESOLVE_RETRY_INTERVALS: readonly number[] = [100, 250, 500, 1_000];

// ── Network-settle middleware ────────────────────────────────

/**
 * Milliseconds with zero pending requests before the network is
 * considered "settled".  A shorter value responds faster but is
 * more likely to resolve between rapid-fire requests.
 */
export const NETWORK_IDLE_TIME_MS = 300;

/**
 * Maximum time (ms) to wait for the network to settle.  If the
 * timeout expires, the middleware warns and continues (does not throw).
 */
export const NETWORK_SETTLE_TIMEOUT_MS = 10_000;

/**
 * Action names that trigger the network-settle middleware by default.
 */
export const NETWORK_SETTLE_ACTIONS: readonly string[] = ["write", "click", "writeAll"];

// ── Date picker navigation ──────────────────────────────────

/**
 * Delay (ms) for waiting for a date picker calendar to update
 * after clicking a month navigation arrow.
 */
export const DATEPICKER_NAV_SETTLE_MS = 100;

// ── Runtime configuration ───────────────────────────────────

/**
 * All configurable timeout and retry values.
 *
 * Pass a partial object to {@link configureTimeouts} to override
 * specific values while keeping the rest at their defaults.
 */
export interface TimeoutConfig {
  toggleFirstAttemptMs: number;
  selectClickTimeoutMs: number;
  selectMaxRetries: number;
  selectRetryDelayMs: number;
  selectExpandDeadlineMs: number;
  selectOptionVisibleMs: number;
  comboboxMaxRetries: number;
  comboboxRetryDelayMs: number;
  pollIntervalMs: number;
  dialogCloseTimeoutMs: number;
  resolveTimeoutMs: number;
  resolveRetryIntervals: readonly number[];
  networkIdleTimeMs: number;
  networkSettleTimeoutMs: number;
  datepickerNavSettleMs: number;
}

const _defaults: TimeoutConfig = {
  toggleFirstAttemptMs: TOGGLE_FIRST_ATTEMPT_MS,
  selectClickTimeoutMs: SELECT_CLICK_TIMEOUT_MS,
  selectMaxRetries: SELECT_MAX_RETRIES,
  selectRetryDelayMs: SELECT_RETRY_DELAY_MS,
  selectExpandDeadlineMs: SELECT_EXPAND_DEADLINE_MS,
  selectOptionVisibleMs: SELECT_OPTION_VISIBLE_MS,
  comboboxMaxRetries: COMBOBOX_MAX_RETRIES,
  comboboxRetryDelayMs: COMBOBOX_RETRY_DELAY_MS,
  pollIntervalMs: POLL_INTERVAL_MS,
  dialogCloseTimeoutMs: DIALOG_CLOSE_TIMEOUT_MS,
  resolveTimeoutMs: RESOLVE_TIMEOUT_MS,
  resolveRetryIntervals: RESOLVE_RETRY_INTERVALS,
  networkIdleTimeMs: NETWORK_IDLE_TIME_MS,
  networkSettleTimeoutMs: NETWORK_SETTLE_TIMEOUT_MS,
  datepickerNavSettleMs: DATEPICKER_NAV_SETTLE_MS,
};

let _overrides: Partial<TimeoutConfig> = {};

/**
 * Override timeout and retry values at runtime.
 *
 * Useful for slow CI environments where the defaults may not be
 * appropriate.  Only the properties you provide are overridden;
 * everything else keeps its default value.
 *
 * ```ts
 * import { configureTimeouts } from "@playwright-elements/core";
 *
 * configureTimeouts({
 *   selectClickTimeoutMs: 5_000,
 *   resolveTimeoutMs: 10_000,
 * });
 * ```
 */
export function configureTimeouts(overrides: Partial<TimeoutConfig>): void {
  const validKeys = new Set<string>(Object.keys(_defaults));
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (!validKeys.has(key)) {
      console.warn(
        `[framework] configureTimeouts: unknown key "${key}". ` +
          `Valid keys: ${[...validKeys].join(", ")}.`,
      );
      continue;
    }
    if (key === "resolveRetryIntervals") {
      const arr = value as readonly number[];
      if (arr.length === 0) throw new RangeError("resolveRetryIntervals must not be empty");
      if (arr.some((v) => !(v > 0))) throw new RangeError("All interval values must be positive");
    } else if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) {
      throw new RangeError(`${key} must be a finite positive number`);
    }
    cleaned[key] = value;
  }
  _overrides = { ..._overrides, ...cleaned };
}

/**
 * Reset all timeout overrides to defaults.
 *
 * Called automatically by the test fixture between tests.
 * To remove a single override, use {@link removeTimeoutOverride}.
 */
export function resetTimeouts(): void {
  _overrides = {};
}

/**
 * Remove a single timeout override, reverting it to the default value.
 *
 * ```ts
 * configureTimeouts({ selectClickTimeoutMs: 10_000 });
 * removeTimeoutOverride("selectClickTimeoutMs"); // back to 3_000
 * ```
 */
export function removeTimeoutOverride(key: keyof TimeoutConfig): void {
  const { [key]: _, ...rest } = _overrides;
  _overrides = rest;
}

/**
 * Get the current effective timeout configuration
 * (defaults merged with any runtime overrides).
 */
export function getTimeouts(): Readonly<TimeoutConfig> {
  return { ..._defaults, ..._overrides };
}
