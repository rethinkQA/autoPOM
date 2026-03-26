/**
 * Verify that the test fixture resets configureTimeouts() between tests.
 *
 * Test 1 sets a custom timeout override; Test 2 verifies defaults are restored.
 * If the fixture's resetTimeouts() cleanup is ever removed, Test 2 fails.
 */

import { test, expect } from "../../src/test-fixture.js";
import { configureTimeouts, getTimeouts } from "../../src/index.js";

test.describe("fixture cleanup — timeout reset", () => {
  test("test A — sets a custom timeout override", () => {
    configureTimeouts({ resolveTimeoutMs: 99999 });
    expect(getTimeouts().resolveTimeoutMs).toBe(99999);
  });

  test("test B — verifies defaults are restored after test A", () => {
    // If fixture cleanup works, this should be the default (not 99999)
    expect(getTimeouts().resolveTimeoutMs).not.toBe(99999);
  });
});
