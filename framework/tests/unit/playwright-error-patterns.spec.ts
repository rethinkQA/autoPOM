/**
 * Smoke tests that verify error classification functions recognise
 * the error messages emitted by the **current** Playwright version.
 *
 * These tests construct Error objects with the exact wording Playwright
 * uses, guarding against silent breakage if a future Playwright release
 * changes its error message phrasing.
 *
 * @see P3-36 in docs/ISSUES.md
 */
import { test, expect, errors } from "@playwright/test";
import {
  isDetachedError,
  isTimeoutError,
  isRetryableInteractionError,
} from "../../src/playwright-errors.js";

test.describe("Playwright error pattern version guard", () => {
  test("isTimeoutError recognises real Playwright TimeoutError", () => {
    const err = new errors.TimeoutError("locator.click: Timeout 5000ms exceeded.");
    expect(isTimeoutError(err)).toBe(true);
    expect(isRetryableInteractionError(err)).toBe(true);
  });

  test("isDetachedError covers all documented DETACHED_PATTERNS", () => {
    // These are the exact substrings Playwright >=1.58 uses.
    // If any of these fail, DETACHED_PATTERNS in playwright-errors.ts
    // needs to be updated for the new Playwright version.
    const patterns = [
      "Error: locator.click: Target closed — element is detached from the DOM",
      "Error: Element is not attached to the DOM",
      "Error: Node is no longer attached to the document",
    ];
    for (const msg of patterns) {
      expect(isDetachedError(new Error(msg)), `Pattern should match: "${msg}"`).toBe(true);
      expect(isRetryableInteractionError(new Error(msg)), `Should be retryable: "${msg}"`).toBe(true);
    }
  });

  test("isRetryableInteractionError covers all INTERACTION_PATTERNS", () => {
    // Each entry mirrors a real-world Playwright error message.
    const messages = [
      "locator.click: Element is not visible",
      "locator.click: Element is animating, waiting for it to stop",
      "locator.click: Element is outside of the viewport",
      "locator.click: Element does not receive pointer events",
      "locator.click: Click was intercepted by another element",
    ];
    for (const msg of messages) {
      expect(isRetryableInteractionError(new Error(msg)), `Should be retryable: "${msg}"`).toBe(true);
    }
  });

  test("non-retryable errors are correctly rejected", () => {
    const permanent = [
      "strict mode violation: getByRole('button') resolved to 3 elements",
      "Assertion failed: expected 'hello' to equal 'world'",
      "page.goto: net::ERR_CONNECTION_REFUSED",
    ];
    for (const msg of permanent) {
      expect(isRetryableInteractionError(new Error(msg)), `Should NOT be retryable: "${msg}"`).toBe(false);
    }
  });
});
