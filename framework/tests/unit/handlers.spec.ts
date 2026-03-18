import { test, expect } from "../../src/test-fixture.js";
import {
  getHandlers,
  registerHandler,
  unregisterHandler,
  resetHandlers,
  getHandlerByType,
  getRoleFallbacks,
} from "../../src/defaults.js";
import type { ElementHandler } from "../../src/handler-types.js";

// ── handlers read-only view ─────────────────────────────────

test.describe("handlers registry", () => {
  test("exposes a non-empty array of built-in handlers", () => {
    expect(getHandlers().length).toBeGreaterThan(0);
  });

  test("last built-in handler is the generic input fallback", () => {
    const last = getHandlers()[getHandlers().length - 1];
    expect(last.type).toBe("input");
  });

  test("each handler has type, detect, set, get", () => {
    for (const h of getHandlers()) {
      expect(typeof h.type).toBe("string");
      expect(Array.isArray(h.detect)).toBe(true);
      expect(h.detect.length).toBeGreaterThan(0);
      expect(typeof h.set).toBe("function");
      expect(typeof h.get).toBe("function");
    }
  });
});

// ── getHandlerByType ────────────────────────────────────────

test.describe("getHandlerByType", () => {
  test("returns the handler with the given type", () => {
    const checkbox = getHandlerByType("checkbox");
    expect(checkbox).toBeDefined();
    expect(checkbox!.type).toBe("checkbox");
  });

  test("returns undefined for unknown type", () => {
    expect(getHandlerByType("nonexistent")).toBeUndefined();
  });
});

// ── registerHandler ─────────────────────────────────────────

test.describe("registerHandler", () => {
  const stub: ElementHandler = {
    type: "custom-widget",
    detect: [{ tags: ["custom-el"] }],
    async set() {},
    async get() { return ""; },
  };

  test("registerHandler('last') inserts before the fallback", () => {
    const lenBefore = getHandlers().length;
    registerHandler(stub, "last");
    expect(getHandlers().length).toBe(lenBefore + 1);
    // Should be second-to-last (before the generic "input" fallback)
    expect(getHandlers()[getHandlers().length - 2].type).toBe("custom-widget");
    expect(getHandlers()[getHandlers().length - 1].type).toBe("input");
  });

  test("registerHandler('first') inserts at index 0", () => {
    registerHandler(stub, "first");
    expect(getHandlers()[0].type).toBe("custom-widget");
  });

  test("registerHandler({ before: ... }) inserts before the named handler", () => {
    registerHandler(stub, { before: "select" });
    const idx = getHandlers().findIndex((h) => h.type === "custom-widget");
    const selectIdx = getHandlers().findIndex((h) => h.type === "select");
    expect(idx).toBeLessThan(selectIdx);
    expect(idx).toBe(selectIdx - 1);
  });

  test("registerHandler({ after: ... }) inserts after the named handler", () => {
    registerHandler(stub, { after: "checkbox" });
    const cbIdx = getHandlers().findIndex((h) => h.type === "checkbox");
    const customIdx = getHandlers().findIndex((h) => h.type === "custom-widget");
    expect(customIdx).toBe(cbIdx + 1);
  });

  test("throws for before/after referencing non-existent handler", () => {
    expect(() => registerHandler(stub, { before: "nope" })).toThrow(
      /no existing handler with type "nope"/i,
    );
    expect(() => registerHandler(stub, { after: "nope" })).toThrow(
      /no existing handler with type "nope"/i,
    );
  });

  test("default position is 'last'", () => {
    registerHandler(stub);
    expect(getHandlers()[getHandlers().length - 2].type).toBe("custom-widget");
  });
});

// ── registerHandler validation rules ────────────────────────

test.describe("registerHandler validation", () => {
  test("rejects duplicate type names", () => {
    // "checkbox" is a built-in handler that is always present
    const dupe: ElementHandler = {
      type: "checkbox",
      detect: [{ tags: ["custom-cb"] }],
      async set() {},
      async get() { return ""; },
    };
    expect(() => registerHandler(dupe)).toThrow(
      /handler with type "checkbox" is already registered/,
    );
  });

  test("rejects handler with empty detect rules", () => {
    const noRules: ElementHandler = {
      type: "no-detect",
      detect: [],
      async set() {},
      async get() { return ""; },
    };
    expect(() => registerHandler(noRules)).toThrow(
      /has no detect rules/,
    );
  });

  test("rejects inputTypes without tags: ['input']", () => {
    const badInputTypes: ElementHandler = {
      type: "bad-input",
      detect: [{ tags: ["div"], inputTypes: ["text"] }],
      async set() {},
      async get() { return ""; },
    };
    expect(() => registerHandler(badInputTypes)).toThrow(
      /inputTypes but tags does not include "input"/,
    );
  });

  test("rejects detect rule with no primary criterion", () => {
    const noPrimary: ElementHandler = {
      type: "no-primary",
      detect: [{} as any],
      async set() {},
      async get() { return ""; },
    };
    expect(() => registerHandler(noPrimary)).toThrow(
      /no primary criterion/,
    );
  });

  test("rejects handler with non-function set", () => {
    const badSet = {
      type: "bad-set",
      detect: [{ tags: ["x"] }],
      set: "not-a-function",
      async get() { return ""; },
    } as unknown as ElementHandler;
    expect(() => registerHandler(badSet)).toThrow(
      /non-function `set`/,
    );
  });

  test("rejects handler with non-function get", () => {
    const badGet = {
      type: "bad-get",
      detect: [{ tags: ["x"] }],
      async set() {},
      get: 42,
    } as unknown as ElementHandler;
    expect(() => registerHandler(badGet)).toThrow(
      /non-function `get`/,
    );
  });

  test("defensively clones handler so later mutations are isolated", () => {
    const mutableDetect = [{ tags: ["mutable-el" as string] }];
    const handler: ElementHandler = {
      type: "mutable-test",
      detect: mutableDetect,
      async set() {},
      async get() { return ""; },
    };
    registerHandler(handler);

    // Mutate the original after registration
    mutableDetect[0].tags[0] = "MUTATED";
    handler.type = "MUTATED" as any;

    // Registry should still have the original values
    const registered = getHandlerByType("mutable-test");
    expect(registered).toBeDefined();
    expect(registered!.type).toBe("mutable-test");
    expect(registered!.detect[0].tags).toContain("mutable-el");
    expect(registered!.detect[0].tags).not.toContain("MUTATED");
  });
});

// ── unregisterHandler ───────────────────────────────────────

test.describe("unregisterHandler", () => {
  test("removes the handler and returns true", () => {
    const lenBefore = getHandlers().length;
    expect(unregisterHandler("checkbox")).toBe(true);
    expect(getHandlers().length).toBe(lenBefore - 1);
    expect(getHandlerByType("checkbox")).toBeUndefined();
  });

  test("returns false for non-existent handler", () => {
    expect(unregisterHandler("nonexistent")).toBe(false);
  });

  test("throws when removing the fallback handler", () => {
    // The fallback handler is the last built-in handler ("input").
    // Removing it must be structurally prevented.
    expect(() => unregisterHandler("input")).toThrow(
      /cannot remove the fallback handler/i,
    );
  });
});

// ── resetHandlers ───────────────────────────────────────────

test.describe("resetHandlers", () => {
  test("restores the built-in handler set after mutations", () => {
    const originalTypes = getHandlers().map((h) => h.type);

    // Mutate heavily
    registerHandler({
      type: "test1",
      detect: [{ tags: ["t1"] }],
      async set() {},
      async get() { return ""; },
    }, "first");
    unregisterHandler("checkbox");

    // Reset
    resetHandlers();

    const restoredTypes = getHandlers().map((h) => h.type);
    expect(restoredTypes).toEqual(originalTypes);
  });
});

// ── getRoleFallbacks ────────────────────────────────────────

test.describe("getRoleFallbacks", () => {
  test("returns an array of role strings", () => {
    const roles = getRoleFallbacks();
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) {
      expect(typeof r).toBe("string");
    }
  });

  test("includes core roles from built-in handlers", () => {
    const roles = getRoleFallbacks();
    // These come from the built-in handler detect rules
    expect(roles).toContain("button");
    expect(roles).toContain("link");
    expect(roles).toContain("switch");
    expect(roles).toContain("combobox");
    expect(roles).toContain("listbox");
    expect(roles).toContain("slider");
  });

  test("stable roles appear in priority order", () => {
    const roles = getRoleFallbacks();
    const groupIdx = roles.indexOf("group");
    const buttonIdx = roles.indexOf("button");
    const linkIdx = roles.indexOf("link");
    // priority: group < radiogroup < listbox < combobox < slider < spinbutton < switch < button < link
    expect(groupIdx).toBeLessThan(buttonIdx);
    expect(buttonIdx).toBeLessThan(linkIdx);
  });

  test("recomputes when a handler with a new role is registered", () => {
    const before = getRoleFallbacks();
    expect(before).not.toContain("meter");

    registerHandler({
      type: "meter-widget",
      detect: [{ roles: ["meter"] }],
      async set() {},
      async get() { return ""; },
    });

    const after = getRoleFallbacks();
    expect(after).toContain("meter");
  });

  test("is idempotent when called multiple times without mutations", () => {
    const a = getRoleFallbacks();
    const b = getRoleFallbacks();
    expect(a).toBe(b); // same array reference (cached)
  });
});
