import { test, expect } from "../../src/test-fixture.js";
import { configureLogger, getLogger } from "../../src/defaults.js";

test.describe("getLogger", () => {
  test("returns a logger with warn and debug methods by default", () => {
    const logger = getLogger();
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("default logger delegates to console.warn", () => {
    const calls: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => calls.push(msg);
    try {
      getLogger().warn("hello");
      expect(calls).toEqual(["hello"]);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("default debug is a silent no-op", () => {
    // debug() should not throw and should not produce console output
    expect(() => getLogger().debug("trace info")).not.toThrow();
  });
});

test.describe("configureLogger", () => {
  test("replaces the warn function", () => {
    const captured: string[] = [];
    configureLogger({ warn: (msg) => captured.push(msg) });

    getLogger().warn("test warning");
    expect(captured).toEqual(["test warning"]);
  });

  test("suppresses output when warn is a no-op", () => {
    const originalWarn = console.warn;
    let called = false;
    console.warn = () => { called = true; };
    try {
      configureLogger({ warn: () => {} });
      getLogger().warn("should be suppressed");
      expect(called).toBe(false);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("passing null resets to defaults", () => {
    const captured: string[] = [];
    configureLogger({ warn: (msg) => captured.push(msg) });
    configureLogger(null);

    // After reset the custom function should no longer be called
    const originalWarn = console.warn;
    const consoleCalls: string[] = [];
    console.warn = (msg: string) => consoleCalls.push(msg);
    try {
      getLogger().warn("after reset");
      expect(captured).toEqual([]);
      expect(consoleCalls).toEqual(["after reset"]);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("partial logger keeps defaults for unset levels", () => {
    // Pass an empty object — warn should fall back to default
    configureLogger({});

    const originalWarn = console.warn;
    const calls: string[] = [];
    console.warn = (msg: string) => calls.push(msg);
    try {
      getLogger().warn("fallback");
      expect(calls).toEqual(["fallback"]);
    } finally {
      console.warn = originalWarn;
    }

    // debug should also keep its default (no-op)
    expect(() => getLogger().debug("still silent")).not.toThrow();
  });

  test("custom debug function receives messages", () => {
    const debugMsgs: string[] = [];
    configureLogger({ debug: (msg) => debugMsgs.push(msg) });

    getLogger().debug("trace 1");
    getLogger().debug("trace 2");
    expect(debugMsgs).toEqual(["trace 1", "trace 2"]);
  });

  test("setting debug does not affect warn", () => {
    const debugMsgs: string[] = [];
    configureLogger({ debug: (msg) => debugMsgs.push(msg) });

    const originalWarn = console.warn;
    const warnCalls: string[] = [];
    console.warn = (msg: string) => warnCalls.push(msg);
    try {
      getLogger().warn("a warning");
      getLogger().debug("a debug");
      expect(warnCalls).toEqual(["a warning"]);
      expect(debugMsgs).toEqual(["a debug"]);
    } finally {
      console.warn = originalWarn;
    }
  });
});
