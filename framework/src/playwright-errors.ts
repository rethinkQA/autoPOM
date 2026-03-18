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
  if (err instanceof Error && err.message.includes("Timeout")) return true;
  return false;
}

// ── Retryable interaction errors ────────────────────────────

/**
 * Common Playwright message patterns for errors that may resolve
 * on retry (e.g. element animating, intercepted click, not visible).
 */
const INTERACTION_PATTERNS = [
  "intercept",
  "not visible",
  "animating",
  "outside of the viewport",
  "receive pointer events",
] as const;

/**
 * Return `true` if `err` is a Playwright interaction error that is
 * likely transient and may succeed on a subsequent attempt.
 *
 * Covers: timeout, detached element, intercepted click, not-visible,
 * animating, and out-of-viewport conditions.
 */
export function isRetryableInteractionError(err: unknown): boolean {
  if (isTimeoutError(err) || isDetachedError(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return INTERACTION_PATTERNS.some((p) => message.includes(p));
}
