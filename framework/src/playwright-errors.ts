/**
 * Centralised Playwright error classification.
 *
 * Playwright exposes `errors.TimeoutError` as a proper class, but does
 * not expose typed subclasses for all error conditions (e.g. detached
 * elements).  This module provides a single maintenance point for error
 * classification — preferring `instanceof` checks where available and
 * falling back to message-string matching otherwise.
 *
 * If a future Playwright release changes its error message wording, only
 * this file needs to be updated.
 *
 * **Validated against:** Playwright >=1.58.0.  Error message patterns
 * were verified against Playwright 1.58–1.52 release notes.  If a
 * future version changes wording, the unit tests in
 * `tests/unit/playwright-errors.spec.ts` will detect the breakage.
 */
import { errors } from "@playwright/test";

// ── Detached-element errors ─────────────────────────────────

/** Strings Playwright uses for detached/stale element errors. */
const DETACHED_PATTERNS = [
  "detached",
  "Element is not attached",
  "no longer attached",
] as const;

/**
 * Return `true` if `err` represents a stale/detached-element condition.
 *
 * Playwright does not expose a typed subclass for these errors, so
 * detection relies on message-string matching.
 */
export function isDetachedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return DETACHED_PATTERNS.some((p) => message.includes(p));
}

// ── Timeout errors ──────────────────────────────────────────

/**
 * Return `true` if `err` is a Playwright timeout error.
 *
 * Prefers `instanceof errors.TimeoutError` where available, with a
 * message-string fallback for edge cases.
 */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof errors.TimeoutError) return true;
  if (err instanceof Error && err.message.includes("Timeout") && err.message.includes("exceeded")) return true;
  return false;
}

// ── Retryable interaction errors ────────────────────────────

/**
 * Common Playwright message patterns for errors that may resolve
 * on retry (e.g. element animating, intercepted click, not visible).
 */
const INTERACTION_PATTERNS: string[] = [
  "intercept",
  "not visible",
  "animating",
  "outside of the viewport",
  "receive pointer events",
];

/** User-registered additional retryable patterns. */
const _customRetryablePatterns: (string | RegExp)[] = [];

/**
 * Register an additional error pattern that should be considered
 * retryable.  Accepts either a plain substring or a `RegExp`.
 *
 * Useful for custom component libraries that produce unique transient
 * error messages not covered by the built-in patterns.
 *
 * ```ts
 * registerRetryablePattern("custom component not ready");
 * registerRetryablePattern(/connection reset/i);
 * ```
 */
export function registerRetryablePattern(pattern: string | RegExp): void {
  _customRetryablePatterns.push(pattern);
}

/**
 * Remove all custom retryable patterns registered via
 * {@link registerRetryablePattern}.
 */
export function resetRetryablePatterns(): void {
  _customRetryablePatterns.length = 0;
}

/**
 * Return `true` if `err` is specifically a Playwright "intercepted" error
 * (another element receives pointer events instead of the target).
 *
 * Unlike {@link isRetryableInteractionError} which matches "not visible",
 * "animating", etc., this only matches interception — used by handlers
 * that should force-click through shadow DOM overlays but should NOT
 * force-click genuinely invisible or animating elements.
 */
export function isInterceptedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("intercept") || message.includes("receive pointer events");
}

/**
 * Return `true` if `err` is a Playwright interaction error that is
 * likely transient and may succeed on a subsequent attempt.
 *
 * Covers: timeout, detached element, intercepted click, not-visible,
 * animating, and out-of-viewport conditions, plus any patterns added
 * via {@link registerRetryablePattern}.
 */
export function isRetryableInteractionError(err: unknown): boolean {
  if (isTimeoutError(err) || isDetachedError(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  if (INTERACTION_PATTERNS.some((p) => message.includes(p))) return true;
  return _customRetryablePatterns.some((p) =>
    typeof p === "string" ? message.includes(p) : p.test(message),
  );
}
