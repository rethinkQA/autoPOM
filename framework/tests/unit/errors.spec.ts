import { test, expect } from "../../src/test-fixture.js";
import {
  ElementNotFoundError,
  AmbiguousMatchError,
  ColumnNotFoundError,
  NoHandlerMatchError,
} from "../../src/errors.js";

// ── ElementNotFoundError ────────────────────────────────────

test.describe("ElementNotFoundError", () => {
  test("is an instance of Error and ElementNotFoundError", () => {
    const err = new ElementNotFoundError("not found", {
      query: "Submit",
      triedStrategies: ["label", "role"],
      container: "form#main",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ElementNotFoundError);
  });

  test("exposes structured context properties", () => {
    const err = new ElementNotFoundError("not found", {
      query: "Submit",
      triedStrategies: ["label", "role"],
      container: "form#main",
    });
    expect(err.message).toBe("not found");
    expect(err.name).toBe("ElementNotFoundError");
    expect(err.query).toBe("Submit");
    expect(err.triedStrategies).toEqual(["label", "role"]);
    expect(err.container).toBe("form#main");
  });

  test("defaults triedStrategies to empty array", () => {
    const err = new ElementNotFoundError("nope", { query: "X" });
    expect(err.triedStrategies).toEqual([]);
    expect(err.container).toBeUndefined();
  });

  test("has a proper stack trace", () => {
    const err = new ElementNotFoundError("oops", { query: "Y" });
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("ElementNotFoundError");
  });
});

// ── AmbiguousMatchError ─────────────────────────────────────

test.describe("AmbiguousMatchError", () => {
  test("is an instance of Error and AmbiguousMatchError", () => {
    const err = new AmbiguousMatchError("ambiguous", {
      query: "Save",
      matchCount: 3,
      strategy: "role",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AmbiguousMatchError);
  });

  test("exposes structured context properties", () => {
    const err = new AmbiguousMatchError("ambiguous", {
      query: "Save",
      matchCount: 3,
      strategy: "role",
    });
    expect(err.message).toBe("ambiguous");
    expect(err.name).toBe("AmbiguousMatchError");
    expect(err.query).toBe("Save");
    expect(err.matchCount).toBe(3);
    expect(err.strategy).toBe("role");
  });

  test("strategy defaults to undefined", () => {
    const err = new AmbiguousMatchError("too many", {
      query: "Btn",
      matchCount: 5,
    });
    expect(err.strategy).toBeUndefined();
  });
});

// ── ColumnNotFoundError ─────────────────────────────────────

test.describe("ColumnNotFoundError", () => {
  test("is an instance of Error and ColumnNotFoundError", () => {
    const err = new ColumnNotFoundError("no col", {
      column: "Price",
      availableColumns: ["Name", "Qty"],
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ColumnNotFoundError);
  });

  test("exposes structured context properties", () => {
    const err = new ColumnNotFoundError("missing column", {
      column: "Price",
      availableColumns: ["Name", "Qty"],
    });
    expect(err.message).toBe("missing column");
    expect(err.name).toBe("ColumnNotFoundError");
    expect(err.column).toBe("Price");
    expect(err.availableColumns).toEqual(["Name", "Qty"]);
  });
});

// ── NoHandlerMatchError ─────────────────────────────────────

test.describe("NoHandlerMatchError", () => {
  test("is an instance of Error and NoHandlerMatchError", () => {
    const err = new NoHandlerMatchError("no handler", {
      tag: "custom-slider",
      role: "slider",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NoHandlerMatchError);
  });

  test("exposes structured context properties", () => {
    const err = new NoHandlerMatchError("no handler matched", {
      tag: "div",
      role: "meter",
    });
    expect(err.message).toBe("no handler matched");
    expect(err.name).toBe("NoHandlerMatchError");
    expect(err.tag).toBe("div");
    expect(err.role).toBe("meter");
  });

  test("role defaults to undefined when not provided", () => {
    const err = new NoHandlerMatchError("no match", {
      tag: "span",
    });
    expect(err.tag).toBe("span");
    expect(err.role).toBeUndefined();
  });

  test("has a proper stack trace", () => {
    const err = new NoHandlerMatchError("oops", { tag: "div" });
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("NoHandlerMatchError");
  });
});
