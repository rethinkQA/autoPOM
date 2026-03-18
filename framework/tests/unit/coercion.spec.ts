import { test, expect } from "../../src/test-fixture.js";
import { asString, asNumber, asBoolean, asStringArray } from "../../src/elements/coercion.js";

test.describe("asString", () => {
  test("returns a string unchanged", () => {
    expect(asString("hello")).toBe("hello");
  });

  test("converts boolean true to 'true'", () => {
    expect(asString(true)).toBe("true");
  });

  test("converts boolean false to 'false'", () => {
    expect(asString(false)).toBe("false");
  });

  test("joins string[] with commas", () => {
    expect(asString(["a", "b", "c"])).toBe("a, b, c");
  });

  test("handles single-element array", () => {
    expect(asString(["only"])).toBe("only");
  });

  test("handles empty string", () => {
    expect(asString("")).toBe("");
  });
});

test.describe("asNumber", () => {
  test("converts numeric string to number", () => {
    expect(asNumber("42")).toBe(42);
  });

  test("converts float string to number", () => {
    expect(asNumber("3.14")).toBeCloseTo(3.14);
  });

  test("converts '0' to 0", () => {
    expect(asNumber("0")).toBe(0);
  });

  test("throws TypeError for non-numeric string", () => {
    expect(() => asNumber("not-a-number")).toThrow(TypeError);
  });

  test("converts empty string to 0 (Number('') === 0)", () => {
    expect(asNumber("")).toBe(0);
  });

  test("throws TypeError for string[]", () => {
    expect(() => asNumber(["a", "b"])).toThrow(TypeError);
  });

  test("converts boolean true to 1", () => {
    expect(asNumber(true)).toBe(1);
  });

  test("converts boolean false to 0", () => {
    expect(asNumber(false)).toBe(0);
  });
});

test.describe("asBoolean", () => {
  test("returns boolean true unchanged", () => {
    expect(asBoolean(true)).toBe(true);
  });

  test("returns boolean false unchanged", () => {
    expect(asBoolean(false)).toBe(false);
  });

  test("converts string 'true' to true", () => {
    expect(asBoolean("true")).toBe(true);
  });

  test("converts string 'false' to false", () => {
    expect(asBoolean("false")).toBe(false);
  });

  test("is case-insensitive for string 'TRUE'", () => {
    expect(asBoolean("TRUE")).toBe(true);
  });

  test("trims whitespace around string", () => {
    expect(asBoolean("  true  ")).toBe(true);
  });

  test("throws TypeError for non-boolean string", () => {
    expect(() => asBoolean("yes")).toThrow(TypeError);
  });

  test("throws TypeError for string[]", () => {
    expect(() => asBoolean(["true"])).toThrow(TypeError);
  });
});

test.describe("asStringArray", () => {
  test("returns string[] unchanged", () => {
    expect(asStringArray(["a", "b"])).toEqual(["a", "b"]);
  });

  test("wraps string in single-element array", () => {
    expect(asStringArray("hello")).toEqual(["hello"]);
  });

  test("converts boolean true to ['true']", () => {
    expect(asStringArray(true)).toEqual(["true"]);
  });

  test("converts boolean false to ['false']", () => {
    expect(asStringArray(false)).toEqual(["false"]);
  });

  test("preserves empty array", () => {
    expect(asStringArray([])).toEqual([]);
  });
});
