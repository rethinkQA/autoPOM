import { test, expect } from "../../src/test-fixture.js";
import { retryUntil, type RetryResult } from "../../src/retry.js";

// ── Immediate success ───────────────────────────────────────

test.describe("retryUntil", () => {
  test("returns immediately on first ok result", async () => {
    const result = await retryUntil(
      async () => ({ ok: true, value: 42 }),
      { timeout: 1_000, intervals: [100] },
    );
    expect(result).toBe(42);
  });

  test("returns value after transient failures", async () => {
    let attempts = 0;
    const result = await retryUntil(async () => {
      attempts++;
      if (attempts < 3) return { ok: false, retryable: true, error: new Error("not yet") };
      return { ok: true, value: "done" };
    }, { timeout: 5_000, intervals: [10, 20, 50] });

    expect(result).toBe("done");
    expect(attempts).toBe(3);
  });

  // ── Non-retryable immediate throw ─────────────────────────

  test("throws immediately on non-retryable failure", async () => {
    const sentinel = new Error("fatal");
    await expect(
      retryUntil(async () => ({ ok: false, retryable: false, error: sentinel }), {
        timeout: 5_000,
        intervals: [100],
      }),
    ).rejects.toThrow(sentinel);
  });

  test("non-retryable failure on second attempt still throws immediately", async () => {
    let attempts = 0;
    const sentinel = new Error("second-attempt-fatal");
    await expect(
      retryUntil(async () => {
        attempts++;
        if (attempts === 1) return { ok: false, retryable: true, error: new Error("transient") };
        return { ok: false, retryable: false, error: sentinel };
      }, { timeout: 5_000, intervals: [10] }),
    ).rejects.toThrow(sentinel);
    expect(attempts).toBe(2);
  });

  // ── Timeout budget enforcement ────────────────────────────

  test("throws last error when timeout budget is exhausted", async () => {
    let attempts = 0;
    const start = Date.now();
    await expect(
      retryUntil(async () => {
        attempts++;
        return { ok: false, retryable: true, error: new Error(`attempt ${attempts}`) };
      }, { timeout: 200, intervals: [20] }),
    ).rejects.toThrow(/attempt/);

    const elapsed = Date.now() - start;
    // Should have taken at least ~200ms (the timeout budget)
    expect(elapsed).toBeGreaterThanOrEqual(150);
    // Should not massively overshoot
    expect(elapsed).toBeLessThan(1_000);
    expect(attempts).toBeGreaterThan(1);
  });

  test("thrown exceptions from callback are treated as retryable", async () => {
    let attempts = 0;
    await expect(
      retryUntil(async (): Promise<RetryResult<string>> => {
        attempts++;
        throw new Error(`thrown ${attempts}`);
      }, { timeout: 100, intervals: [10] }),
    ).rejects.toThrow(/thrown/);
    expect(attempts).toBeGreaterThan(1);
  });

  // ── Interval progression ──────────────────────────────────

  test("respects progressive interval schedule", async () => {
    const timestamps: number[] = [];
    let attempts = 0;
    await expect(
      retryUntil(async () => {
        timestamps.push(Date.now());
        attempts++;
        return { ok: false, retryable: true, error: new Error("retry") };
      }, { timeout: 500, intervals: [50, 100, 200] }),
    ).rejects.toThrow();

    // Verify at least the first few gaps grow (progressive back-off)
    if (timestamps.length >= 3) {
      const gap1 = timestamps[1] - timestamps[0];
      const gap2 = timestamps[2] - timestamps[1];
      // Second gap should be at least somewhat larger than the first
      // (allowing tolerance for scheduling jitter)
      expect(gap2).toBeGreaterThanOrEqual(gap1 * 0.7);
    }
  });

  test("last interval repeats when schedule is exhausted", async () => {
    const timestamps: number[] = [];
    await expect(
      retryUntil(async () => {
        timestamps.push(Date.now());
        return { ok: false, retryable: true, error: new Error("retry") };
      }, { timeout: 400, intervals: [10, 100] }),
    ).rejects.toThrow();

    // After the first two attempts (10ms gap, 100ms gap), subsequent
    // gaps should be ~100ms (the last interval repeating).
    if (timestamps.length >= 4) {
      const laterGap = timestamps[3] - timestamps[2];
      // The repeated interval is 100ms; allow tolerance
      expect(laterGap).toBeGreaterThanOrEqual(70);
    }
  });

  // ── Edge: success right before timeout ────────────────────

  test("succeeds if ok returned just before deadline", async () => {
    let attempts = 0;
    const result = await retryUntil(async () => {
      attempts++;
      if (attempts < 3) return { ok: false, retryable: true, error: new Error("not yet") };
      return { ok: true, value: "just-in-time" };
    }, { timeout: 2_000, intervals: [10] });

    expect(result).toBe("just-in-time");
  });

  // ── Edge: non-retryable error is not swallowed by lastError ─

  test("non-retryable error is thrown even if lastError exists", async () => {
    let attempts = 0;
    const fatal = new Error("non-retryable");
    await expect(
      retryUntil(async () => {
        attempts++;
        if (attempts === 1) return { ok: false, retryable: true, error: new Error("transient") };
        return { ok: false, retryable: false, error: fatal };
      }, { timeout: 5_000, intervals: [10] }),
    ).rejects.toBe(fatal);
  });
});
