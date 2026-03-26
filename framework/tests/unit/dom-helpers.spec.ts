import { test, expect } from "../../src/test-fixture.js";
import { cssEscape } from "../../src/dom-helpers.js";

// ── cssEscape ───────────────────────────────────────────────

test.describe("cssEscape", () => {
  test("escapes a simple ID string", () => {
    expect(cssEscape("hello")).toBe("hello");
  });

  test("escapes leading digit", () => {
    const result = cssEscape("1foo");
    // Should produce a valid escaped identifier
    expect(result).not.toBe("1foo");
    expect(result).toContain("1");
  });

  test("escapes special characters", () => {
    const result = cssEscape("foo.bar");
    expect(result).toContain("\\");
  });

  test("escapes null character to replacement character", () => {
    const result = cssEscape("a\0b");
    expect(result).toContain("\uFFFD");
  });

  test("handles empty string", () => {
    expect(cssEscape("")).toBe("");
  });

  test("escapes hyphen-only string", () => {
    const result = cssEscape("-");
    expect(result).toBe("\\-");
  });

  test("handles alphanumeric-only strings without escaping", () => {
    expect(cssEscape("fooBar123")).toBe("fooBar123");
  });

  test("escapes spaces", () => {
    const result = cssEscape("foo bar");
    expect(result).toContain("\\");
  });
});
