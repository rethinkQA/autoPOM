import { test, expect } from "../../src/test-fixture.js";
import { wrapElement, ACTIONS } from "../../src/wrap-element.js";
import { createFrameworkContext } from "../../src/context.js";

// ── ACTIONS symbol ──────────────────────────────────────────

test.describe("ACTIONS symbol", () => {
  test("is a unique symbol", () => {
    expect(typeof ACTIONS).toBe("symbol");
    expect(ACTIONS.toString()).toContain("framework.actions");
  });

  test("is attached to the original element by wrapElement", () => {
    const ctx = createFrameworkContext();
    const element: Record<string, unknown> = { async click() { return "clicked"; } };
    wrapElement("button", element, ctx, ["click"]);
    // ACTIONS symbol is set on the original element (non-enumerable) before
    // wrapping. The wrapped copy is a spread, so the symbol doesn't transfer —
    // but the original element carries it for introspection.
    expect((element as any)[ACTIONS]).toBeInstanceOf(Set);
    expect((element as any)[ACTIONS].has("click")).toBe(true);
  });
});

// ── Freeze behavior ─────────────────────────────────────────

test.describe("freeze behavior", () => {
  test("returned element is frozen", () => {
    const ctx = createFrameworkContext();
    const element = {
      async click() { return "clicked"; },
      async read() { return "text"; },
    };
    const wrapped = wrapElement("button", element, ctx, ["click", "read"]);
    expect(Object.isFrozen(wrapped)).toBe(true);
  });

  test("cannot add new properties to wrapped element", () => {
    const ctx = createFrameworkContext();
    const element = { async click() { return "clicked"; } };
    const wrapped = wrapElement("button", element, ctx, ["click"]);

    expect(() => {
      (wrapped as any).newProp = "should fail";
    }).toThrow();
  });

  test("cannot modify existing properties on wrapped element", () => {
    const ctx = createFrameworkContext();
    const element = { async click() { return "clicked"; } };
    const wrapped = wrapElement("button", element, ctx, ["click"]);

    expect(() => {
      (wrapped as any).click = () => "hacked";
    }).toThrow();
  });

  test("returns element as-is (unfrozen) when no actions are declared", () => {
    const ctx = createFrameworkContext();
    const element = { value: 42 };
    const wrapped = wrapElement("test", element, ctx);
    expect(wrapped).toBe(element);
    // Not frozen because no wrapping occurred
    expect(Object.isFrozen(wrapped)).toBe(false);
  });
});

// ── Action wrapping ─────────────────────────────────────────

test.describe("action wrapping", () => {
  test("action methods pass through the middleware pipeline", async () => {
    const ctx = createFrameworkContext();
    const calls: string[] = [];

    ctx.middleware.useMiddleware(async (_ctx, next) => {
      calls.push("middleware");
      return next();
    });

    const element = {
      async click() {
        calls.push("click");
        return "done";
      },
    };
    const wrapped = wrapElement("button", element, ctx, ["click"]);
    const result = await wrapped.click();

    expect(result).toBe("done");
    expect(calls).toEqual(["middleware", "click"]);
  });

  test("non-action methods bypass the middleware pipeline", async () => {
    const ctx = createFrameworkContext();
    const calls: string[] = [];

    ctx.middleware.useMiddleware(async (_ctx, next) => {
      calls.push("middleware");
      return next();
    });

    const element = {
      async click() { return "clicked"; },
      isVisible() { return true; },
    };
    const wrapped = wrapElement("button", element, ctx, ["click"]);

    // Non-action method should work but not trigger middleware
    expect(wrapped.isVisible()).toBe(true);
    expect(calls).toEqual([]);
  });

  test("ActionContext carries correct elementType and action name", async () => {
    const ctx = createFrameworkContext();
    let capturedCtx: any;

    ctx.middleware.useMiddleware(async (actionCtx, next) => {
      capturedCtx = actionCtx;
      return next();
    });

    const element = { async read() { return "text"; } };
    const wrapped = wrapElement("textbox", element, ctx, ["read"]);
    await wrapped.read();

    expect(capturedCtx.elementType).toBe("textbox");
    expect(capturedCtx.action).toBe("read");
    expect(capturedCtx.startTime).toBeGreaterThan(0);
  });
});

// ── forceMiddleware ─────────────────────────────────────────

test.describe("forceMiddleware", () => {
  test("ActionContext includes forceMiddleware when meta.forceMiddleware is true", async () => {
    const ctx = createFrameworkContext();
    let capturedCtx: any;

    ctx.middleware.useMiddleware(async (actionCtx, next) => {
      capturedCtx = actionCtx;
      return next();
    });

    const element = { async read() { return "toast"; } };
    const wrapped = wrapElement("toast", element, ctx, ["read"], {
      forceMiddleware: true,
    });
    await wrapped.read();

    expect(capturedCtx.forceMiddleware).toBe(true);
  });

  test("ActionContext does not have forceMiddleware when not set in meta", async () => {
    const ctx = createFrameworkContext();
    let capturedCtx: any;

    ctx.middleware.useMiddleware(async (actionCtx, next) => {
      capturedCtx = actionCtx;
      return next();
    });

    const element = { async click() {} };
    const wrapped = wrapElement("button", element, ctx, ["click"]);
    await wrapped.click();

    expect(capturedCtx.forceMiddleware).toBeUndefined();
  });
});

// ── Validation ──────────────────────────────────────────────

test.describe("validation", () => {
  test("throws when a declared action is not a function on the element", () => {
    const ctx = createFrameworkContext();
    const element = {
      click: "not-a-function",
      async read() { return ""; },
    };

    expect(() =>
      wrapElement("button", element as any, ctx, ["click", "read"]),
    ).toThrow(/action "click" is not a function/);
  });

  test("throws with a helpful message listing available methods", () => {
    const ctx = createFrameworkContext();
    const element = {
      async read() { return ""; },
      async write() {},
    };

    expect(() =>
      wrapElement("textbox", element, ctx, ["read", "write", "typo" as any]),
    ).toThrow(/Available methods:.*read.*write/);
  });
});

// ── Symbol.toStringTag ──────────────────────────────────────

test.describe("Symbol.toStringTag", () => {
  test("wrapped element has a debug-friendly toStringTag", () => {
    const ctx = createFrameworkContext();
    const element = { async click() {} };
    const wrapped = wrapElement("button", element, ctx, ["click"]);
    expect(Object.prototype.toString.call(wrapped)).toContain("FrameworkElement<button>");
  });
});
