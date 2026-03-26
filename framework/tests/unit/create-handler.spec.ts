import { test, expect } from "../../src/test-fixture.js";
import { createHandler, getDefaultHandlerByType } from "../../src/default-handlers.js";

test.describe("createHandler", () => {
  test("extends a built-in handler without overrides", () => {
    const handler = createHandler({
      extends: "checkbox",
      type: "my-checkbox",
    });
    expect(handler.type).toBe("my-checkbox");
    // Inherits set/get from the base handler
    expect(typeof handler.set).toBe("function");
    expect(typeof handler.get).toBe("function");
    // Inherits detect rules from the base handler
    const base = getDefaultHandlerByType("checkbox");
    expect(handler.detect).toEqual(base.detect);
  });

  test("overrides set/get while preserving base detect rules", () => {
    const customSet = async () => {};
    const customGet = async () => "custom";
    const handler = createHandler({
      extends: "select",
      type: "my-select",
      set: customSet,
      get: customGet,
    });
    expect(handler.type).toBe("my-select");
    expect(handler.set).toBe(customSet);
    expect(handler.get).toBe(customGet);
    // detect falls through to the base
    const base = getDefaultHandlerByType("select");
    expect(handler.detect).toEqual(base.detect);
  });

  test("overrides detect rules when explicitly provided", () => {
    const customDetect = [{ roles: ["combobox" as const], attr: ["data-custom", "true"] as [string, string] }];
    const handler = createHandler({
      extends: "combobox",
      type: "my-combobox",
      detect: customDetect,
    });
    expect(handler.detect).toEqual(customDetect);
    // set/get fall through
    const base = getDefaultHandlerByType("combobox");
    expect(handler.set).toBe(base.set);
    expect(handler.get).toBe(base.get);
  });

  test("throws for invalid base type", () => {
    expect(() =>
      createHandler({
        extends: "nonexistent-widget",
        type: "my-widget",
      }),
    ).toThrow(/no built-in handler with type "nonexistent-widget"/);
  });

  test("overrides valueKind when provided", () => {
    const handler = createHandler({
      extends: "checkbox",
      type: "tristate-checkbox",
      valueKind: "string",
    });
    expect(handler.valueKind).toBe("string");
    // Base checkbox has valueKind "boolean"
    const base = getDefaultHandlerByType("checkbox");
    expect(base.valueKind).toBe("boolean");
  });

  test("returned handler is frozen (matching registerHandler depth)", () => {
    const handler = createHandler({
      extends: "checkbox",
      type: "frozen-checkbox",
    });

    // The handler object itself is frozen
    expect(Object.isFrozen(handler)).toBe(true);

    // The detect array is frozen
    expect(Object.isFrozen(handler.detect)).toBe(true);

    // Each detect rule is frozen
    for (const rule of handler.detect) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });
});
