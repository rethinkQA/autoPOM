/**
 * Named constants for timeouts and retry limits used across the framework.
 *
 * Centralised here so that:
 * 1. Every magic number has a descriptive name.
 * 2. Tuning values is a single-file change.
 * 3. Reviewers can audit timing behaviour in one place.
 *
 * @module
 */

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

/** Maximum retry iterations when waiting for a dropdown option to appear. */
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

/** Maximum retry iterations for the hybrid editable combobox handler. */
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
