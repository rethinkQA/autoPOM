import { test, expect } from "../../src/test-fixture.js";
import {
  isDetachedError,
  isTimeoutError,
  isRetryableInteractionError,
} from "../../src/playwright-errors.js";

// ── isDetachedError ─────────────────────────────────────────

test.describe("isDetachedError", () => {
  test("detects 'detached' keyword", () => {
    expect(isDetachedError(new Error("Element is detached from the DOM"))).toBe(true);
  });

  test("detects 'Element is not attached'", () => {
    expect(isDetachedError(new Error("Element is not attached to the DOM"))).toBe(true);
  });

  test("detects 'no longer attached'", () => {
    expect(isDetachedError(new Error("Target is no longer attached"))).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isDetachedError(new Error("Click intercepted"))).toBe(false);
  });

  test("handles non-Error values", () => {
    expect(isDetachedError("detached string")).toBe(true);
    expect(isDetachedError("something else")).toBe(false);
  });
});

// ── isTimeoutError ──────────────────────────────────────────

test.describe("isTimeoutError", () => {
  test("detects errors with 'Timeout' in message", () => {
    expect(isTimeoutError(new Error("Timeout 5000ms exceeded"))).toBe(true);
  });

  test("returns false for non-timeout errors", () => {
    expect(isTimeoutError(new Error("Element not found"))).toBe(false);
  });
});

// ── isRetryableInteractionError ─────────────────────────────

test.describe("isRetryableInteractionError", () => {
  test("treats timeout errors as retryable", () => {
    expect(isRetryableInteractionError(new Error("Timeout 5000ms exceeded"))).toBe(true);
  });

  test("treats detached errors as retryable", () => {
    expect(isRetryableInteractionError(new Error("Element is detached"))).toBe(true);
  });

  test("treats 'intercept' errors as retryable", () => {
    expect(isRetryableInteractionError(new Error("Click intercepted by another element"))).toBe(true);
  });

  test("treats 'not visible' errors as retryable", () => {
    expect(isRetryableInteractionError(new Error("Element is not visible"))).toBe(true);
  });

  test("treats 'animating' errors as retryable", () => {
    expect(isRetryableInteractionError(new Error("Element is animating, retrying"))).toBe(true);
  });

  test("treats 'outside of the viewport' as retryable", () => {
    expect(isRetryableInteractionError(new Error("Element is outside of the viewport"))).toBe(true);
  });

  test("treats 'receive pointer events' as retryable", () => {
    expect(isRetryableInteractionError(new Error("Element does not receive pointer events"))).toBe(true);
  });

  test("returns false for non-retryable errors", () => {
    expect(isRetryableInteractionError(new Error("Assertion failed: expected 'foo'"))).toBe(false);
  });
});
