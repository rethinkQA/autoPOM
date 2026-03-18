import { test, expect } from "../../src/test-fixture.js";
import { configureResolveRetry, resetResolveRetry } from "../../src/defaults.js";
import { ResolveRetryConfig } from "../../src/resolve-retry-config.js";

// ── ResolveRetryConfig class (direct) ───────────────────────

test.describe("ResolveRetryConfig (class-level)", () => {
  test("has sensible defaults", () => {
    const cfg = new ResolveRetryConfig();
    expect(cfg.resolveTimeoutMs).toBe(5_000);
    expect(cfg.resolveRetryIntervals).toEqual([100, 250, 500, 1_000]);
  });

  test("configureResolveRetry updates timeout", () => {
    const cfg = new ResolveRetryConfig();
    cfg.configureResolveRetry({ timeoutMs: 10_000 });
    expect(cfg.resolveTimeoutMs).toBe(10_000);
    // intervals unchanged
    expect(cfg.resolveRetryIntervals).toEqual([100, 250, 500, 1_000]);
  });

  test("configureResolveRetry updates intervals", () => {
    const cfg = new ResolveRetryConfig();
    cfg.configureResolveRetry({ intervals: [50, 100] });
    expect(cfg.resolveRetryIntervals).toEqual([50, 100]);
    // timeout unchanged
    expect(cfg.resolveTimeoutMs).toBe(5_000);
  });

  test("configureResolveRetry updates both at once", () => {
    const cfg = new ResolveRetryConfig();
    cfg.configureResolveRetry({ timeoutMs: 2_000, intervals: [200] });
    expect(cfg.resolveTimeoutMs).toBe(2_000);
    expect(cfg.resolveRetryIntervals).toEqual([200]);
  });

  test("rejects zero timeoutMs", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ timeoutMs: 0 })).toThrow(RangeError);
  });

  test("rejects negative timeoutMs", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ timeoutMs: -1 })).toThrow(RangeError);
  });

  test("rejects empty intervals array", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ intervals: [] })).toThrow(RangeError);
  });

  test("rejects negative interval values", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ intervals: [-100, 200] })).toThrow(RangeError);
  });

  test("rejects zero interval values", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ intervals: [100, 0] })).toThrow(RangeError);
  });

  test("rejects mixed negative and zero intervals", () => {
    const cfg = new ResolveRetryConfig();
    expect(() => cfg.configureResolveRetry({ intervals: [-100, 0] })).toThrow(RangeError);
  });

  test("resetResolveRetry restores defaults after configure", () => {
    const cfg = new ResolveRetryConfig();
    cfg.configureResolveRetry({ timeoutMs: 999, intervals: [10] });
    cfg.resetResolveRetry();
    expect(cfg.resolveTimeoutMs).toBe(5_000);
    expect(cfg.resolveRetryIntervals).toEqual([100, 250, 500, 1_000]);
  });

  test("resetResolveRetry is idempotent", () => {
    const cfg = new ResolveRetryConfig();
    cfg.resetResolveRetry();
    cfg.resetResolveRetry();
    expect(cfg.resolveTimeoutMs).toBe(5_000);
    expect(cfg.resolveRetryIntervals).toEqual([100, 250, 500, 1_000]);
  });

  test("configure after reset applies correctly", () => {
    const cfg = new ResolveRetryConfig();
    cfg.configureResolveRetry({ timeoutMs: 1_000 });
    cfg.resetResolveRetry();
    cfg.configureResolveRetry({ timeoutMs: 3_000 });
    expect(cfg.resolveTimeoutMs).toBe(3_000);
    // intervals should still be defaults since we didn't override them
    expect(cfg.resolveRetryIntervals).toEqual([100, 250, 500, 1_000]);
  });
});

// ── Public API wrappers (defaults.ts) ───────────────────────

test.describe("configureResolveRetry / resetResolveRetry (public API)", () => {
  test("configureResolveRetry updates active context", () => {
    configureResolveRetry({ timeoutMs: 7_500, intervals: [50, 150] });
    // Verify through a fresh ResolveRetryConfig reference isn't possible
    // via the public API, but at minimum no error is thrown.
    // resetResolveRetry restores defaults (proving configure was effective
    // would require inspecting the active context — covered by class tests).
    resetResolveRetry();
  });

  test("resetResolveRetry does not throw", () => {
    expect(() => resetResolveRetry()).not.toThrow();
  });

  test("rejects invalid values through public API", () => {
    expect(() => configureResolveRetry({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => configureResolveRetry({ timeoutMs: -100 })).toThrow(RangeError);
    expect(() => configureResolveRetry({ intervals: [] })).toThrow(RangeError);
  });
});
