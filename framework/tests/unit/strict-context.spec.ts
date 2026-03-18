import { test, expect } from "@playwright/test";
import {
  createFrameworkContext,
  getActiveContext,
  setStrictContextMode,
  resetWarningState,
  checkMutationScope,
  runWithContext,
  setFallbackContext,
} from "../../src/context.js";

/**
 * Tests for setStrictContextMode() and resetWarningState().
 *
 * These tests manipulate module-level state (_strictContextMode,
 * _warnedAboutDefaultFallback, _mutationWarned), so they must run
 * serially and restore defaults in afterEach to avoid cross-test leakage.
 */
test.describe("setStrictContextMode / resetWarningState", () => {
  test.afterEach(() => {
    // Restore strict mode (the default) and clear warning state
    setStrictContextMode(true);
    setFallbackContext(undefined);
    resetWarningState();
  });

  test("strict mode: getActiveContext() throws outside a scope", () => {
    // Ensure no fallback is installed
    setFallbackContext(undefined);
    setStrictContextMode(true);
    expect(() => getActiveContext()).toThrow(
      /getActiveContext\(\) was called outside an AsyncLocalStorage scope/,
    );
  });

  test("strict mode: getActiveContext() succeeds inside runWithContext()", () => {
    setStrictContextMode(true);
    const ctx = createFrameworkContext();
    runWithContext(ctx, () => {
      const active = getActiveContext();
      expect(active).toBe(ctx);
    });
  });

  test("strict mode: checkMutationScope() throws outside a scope", () => {
    setFallbackContext(undefined);
    setStrictContextMode(true);
    expect(() => checkMutationScope("registerHandler")).toThrow(
      /registerHandler\(\) was called outside a runWithContext\(\) scope/,
    );
  });

  test("strict mode: checkMutationScope() is a no-op inside runWithContext()", () => {
    setStrictContextMode(true);
    const ctx = createFrameworkContext();
    runWithContext(ctx, () => {
      // Should not throw
      checkMutationScope("registerHandler");
    });
  });

  test("non-strict mode: getActiveContext() returns defaultContext with warning", () => {
    setFallbackContext(undefined);
    setStrictContextMode(false);
    // Capture console.error calls
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
    try {
      const ctx = getActiveContext();
      expect(ctx).toBeDefined();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("getActiveContext() was called outside an AsyncLocalStorage scope");
    } finally {
      console.error = originalError;
    }
  });

  test("non-strict mode: checkMutationScope() warns once per operation", () => {
    setFallbackContext(undefined);
    setStrictContextMode(false);
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
    try {
      checkMutationScope("testOp");
      checkMutationScope("testOp");  // second call — should be deduplicated
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("testOp()");
    } finally {
      console.error = originalError;
    }
  });

  test("resetWarningState() causes mutation warnings to re-fire", () => {
    setFallbackContext(undefined);
    setStrictContextMode(false);
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
    try {
      checkMutationScope("resetTest");
      expect(errors.length).toBe(1);

      // Reset warning state
      resetWarningState();

      // The same operation should warn again
      checkMutationScope("resetTest");
      expect(errors.length).toBe(2);
    } finally {
      console.error = originalError;
    }
  });
});
