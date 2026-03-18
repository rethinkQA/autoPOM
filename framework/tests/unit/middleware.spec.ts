import { test, expect } from "../../src/test-fixture.js";
import {
  useMiddleware,
  removeMiddleware,
  clearMiddleware,
  runAction,
} from "../../src/defaults.js";
import type { ActionContext, Middleware } from "../../src/middleware-types.js";
import { wrapElement, ACTIONS } from "../../src/wrap-element.js";
import { getActiveContext } from "../../src/context.js";

// ── runAction ───────────────────────────────────────────────

test.describe("runAction", () => {
  const ctx: ActionContext = { elementType: "button", action: "click", args: [], startTime: Date.now() };

  test("runs the action directly when no middleware is registered", async () => {
    const result = await runAction(ctx, async () => "done");
    expect(result).toBe("done");
  });

  test("runs action through a single middleware", async () => {
    const order: string[] = [];
    useMiddleware(async (_ctx, next) => {
      order.push("before");
      const val = await next();
      order.push("after");
      return val;
    });

    const result = await runAction(ctx, async () => {
      order.push("action");
      return 42;
    });

    expect(result).toBe(42);
    expect(order).toEqual(["before", "action", "after"]);
  });

  test("chains multiple middlewares in registration order", async () => {
    const order: string[] = [];

    useMiddleware(async (_ctx, next) => {
      order.push("mw1-before");
      const val = await next();
      order.push("mw1-after");
      return val;
    });

    useMiddleware(async (_ctx, next) => {
      order.push("mw2-before");
      const val = await next();
      order.push("mw2-after");
      return val;
    });

    await runAction(ctx, async () => { order.push("action"); });

    expect(order).toEqual([
      "mw1-before",
      "mw2-before",
      "action",
      "mw2-after",
      "mw1-after",
    ]);
  });

  test("middleware receives the correct context", async () => {
    let captured: ActionContext | undefined;
    useMiddleware(async (c, next) => {
      captured = c;
      return next();
    });

    const myCtx: ActionContext = {
      elementType: "table",
      action: "findRow",
      args: [{ Name: "Apples" }],
      startTime: Date.now(),
    };
    await runAction(myCtx, async () => {});
    expect(captured).toBe(myCtx);
  });

  test("middleware can short-circuit the chain", async () => {
    let actionCalled = false;
    useMiddleware(async () => "intercepted");

    const result = await runAction(ctx, async () => {
      actionCalled = true;
      return "original";
    });

    expect(result).toBe("intercepted");
    expect(actionCalled).toBe(false);
  });

  test("middleware error propagates to caller", async () => {
    useMiddleware(async () => { throw new Error("boom"); });

    await expect(
      runAction(ctx, async () => "ok"),
    ).rejects.toThrow("boom");
  });
});

// ── useMiddleware / removeMiddleware / clearMiddleware ───────

test.describe("middleware registry", () => {
  test("removeMiddleware returns true and removes the middleware", async () => {
    const mw: Middleware = async (_ctx, next) => next();
    useMiddleware(mw);
    expect(removeMiddleware(mw)).toBe(true);

    // After removal the action should run without middleware
    const order: string[] = [];
    const ctx: ActionContext = { elementType: "t", action: "a", args: [], startTime: Date.now() };
    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["action"]);
  });

  test("removeMiddleware returns false for unknown middleware", () => {
    const mw: Middleware = async (_ctx, next) => next();
    expect(removeMiddleware(mw)).toBe(false);
  });

  test("useMiddleware throws on duplicate registration", () => {
    const mw: Middleware = async (_ctx, next) => next();
    useMiddleware(mw);
    expect(() => useMiddleware(mw)).toThrow(/already registered/);
  });

  test("clearMiddleware removes all middlewares", async () => {
    useMiddleware(async (_ctx, next) => next());
    useMiddleware(async (_ctx, next) => next());
    clearMiddleware();

    const order: string[] = [];
    const ctx: ActionContext = { elementType: "t", action: "a", args: [], startTime: Date.now() };
    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["action"]);
  });
});

// ── useMiddleware positioning ───────────────────────────────

test.describe("useMiddleware positioning", () => {
  const ctx: ActionContext = { elementType: "t", action: "a", args: [], startTime: Date.now() };

  test("\"first\" inserts before all existing middlewares", async () => {
    const order: string[] = [];
    useMiddleware(async (_ctx, next) => { order.push("A"); return next(); });
    useMiddleware(async (_ctx, next) => { order.push("B"); return next(); });
    useMiddleware(async (_ctx, next) => { order.push("FIRST"); return next(); }, "first");

    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["FIRST", "A", "B", "action"]);
  });

  test("\"last\" appends after all existing middlewares (default)", async () => {
    const order: string[] = [];
    useMiddleware(async (_ctx, next) => { order.push("A"); return next(); });
    useMiddleware(async (_ctx, next) => { order.push("LAST"); return next(); }, "last");

    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["A", "LAST", "action"]);
  });

  test("{ before } inserts before the referenced middleware", async () => {
    const order: string[] = [];
    const mwA: Middleware = async (_ctx, next) => { order.push("A"); return next(); };
    const mwB: Middleware = async (_ctx, next) => { order.push("B"); return next(); };
    const mwInserted: Middleware = async (_ctx, next) => { order.push("INS"); return next(); };

    useMiddleware(mwA);
    useMiddleware(mwB);
    useMiddleware(mwInserted, { before: mwB });

    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["A", "INS", "B", "action"]);
  });

  test("{ after } inserts after the referenced middleware", async () => {
    const order: string[] = [];
    const mwA: Middleware = async (_ctx, next) => { order.push("A"); return next(); };
    const mwB: Middleware = async (_ctx, next) => { order.push("B"); return next(); };
    const mwInserted: Middleware = async (_ctx, next) => { order.push("INS"); return next(); };

    useMiddleware(mwA);
    useMiddleware(mwB);
    useMiddleware(mwInserted, { after: mwA });

    await runAction(ctx, async () => { order.push("action"); });
    expect(order).toEqual(["A", "INS", "B", "action"]);
  });

  test("{ before } throws when referenced middleware is not registered", () => {
    const unknown: Middleware = async (_ctx, next) => next();
    const mw: Middleware = async (_ctx, next) => next();
    expect(() => useMiddleware(mw, { before: unknown })).toThrow(
      /referenced 'before' middleware.*is not registered/,
    );
  });

  test("{ after } throws when referenced middleware is not registered", () => {
    const unknown: Middleware = async (_ctx, next) => next();
    const mw: Middleware = async (_ctx, next) => next();
    expect(() => useMiddleware(mw, { after: unknown })).toThrow(
      /referenced 'after' middleware.*is not registered/,
    );
  });
});

// ── wrapElement ─────────────────────────────────────────────

test.describe("wrapElement", () => {
  test("wraps async methods through middleware", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(`mw:${ctx.action}`);
      return next();
    });

    const raw = {
      async click() { calls.push("click"); return "clicked"; },
      async read() { calls.push("read"); return "value"; },
    };
    const wrapped = wrapElement("button", raw, getActiveContext(), ["click", "read"]);

    const result = await wrapped.click();
    expect(result).toBe("clicked");
    expect(calls).toEqual(["mw:click", "click"]);

    calls.length = 0;
    const val = await wrapped.read();
    expect(val).toBe("value");
    expect(calls).toEqual(["mw:read", "read"]);
  });

  test("wraps non-async methods that return Promises", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(`mw:${ctx.action}`);
      return next();
    });

    const raw = {
      // A method returning a Promise WITHOUT the `async` keyword.
      click() { calls.push("click"); return Promise.resolve("clicked"); },
    };
    const wrapped = wrapElement("button", raw, getActiveContext(), ["click"]);

    const result = await wrapped.click();
    expect(result).toBe("clicked");
    expect(calls).toEqual(["mw:click", "click"]);
  });

  test("methods without ACTIONS declaration bypass middleware", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(ctx.action);
      return next();
    });

    const raw = {
      async withTimeout() { return "timeout-result"; },
      async locator() { return "loc"; },
      overrideHandler() { return raw; },
      toString() { return "str"; },
      toJSON() { return {}; },
    };
    // No actions declared — nothing should be wrapped
    const wrapped = wrapElement("test", raw, getActiveContext());

    await wrapped.withTimeout();
    await wrapped.locator();
    (wrapped as any).overrideHandler();
    wrapped.toString();
    wrapped.toJSON();
    expect(calls).toEqual([]); // nothing went through middleware
  });

  test("non-function properties pass through", () => {
    const raw = { name: "hello", count: 42, flag: true };
    const wrapped = wrapElement("test", raw, getActiveContext());
    expect(wrapped.name).toBe("hello");
    expect(wrapped.count).toBe(42);
    expect(wrapped.flag).toBe(true);
  });

  test("action context includes element type and args", async () => {
    let captured: ActionContext | undefined;
    useMiddleware(async (ctx, next) => { captured = ctx; return next(); });

    const raw = {
      async write(value: string) { return value; },
    };
    const wrapped = wrapElement("textInput", raw, getActiveContext(), ["write"]);
    await wrapped.write("hello");

    expect(captured!.elementType).toBe("textInput");
    expect(captured!.action).toBe("write");
    expect(captured!.args).toEqual(["hello"]);
  });

  test("inner self-calls bypass middleware pipeline (nested-action guard)", async () => {
    const actions: string[] = [];
    useMiddleware(async (ctx, next) => {
      actions.push(ctx.action);
      return next();
    });

    const raw = {
      async writeAll() {
        // Inner this.write() calls are structurally guarded by the
        // nested-action flag in MiddlewarePipeline, so they bypass
        // middleware — preventing duplicate logs, retries, and timing.
        await this.write("one");
        await this.write("two");
      },
      async write(v: string) { return v; },
    };
    const wrapped = wrapElement("group", raw, getActiveContext(), ["writeAll", "write"]);
    await wrapped.writeAll();

    // Only the outer writeAll() triggers middleware; the inner
    // this.write() calls bypass the pipeline thanks to the
    // nested-action guard in MiddlewarePipeline.runAction().
    expect(actions).toEqual(["writeAll"]);
  });

  test("ACTIONS allowlist: only declared actions enter middleware", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(ctx.action);
      return next();
    });

    const raw = {
      async click() { return "clicked"; },
      async read() { return "value"; },
      async isVisible() { return true; },
      async waitForHidden() { /* no-op */ },
      async withTimeout() { return raw; },
      async locator() { return "loc"; },
    };

    // Only "click" and "read" are declared actions
    const wrapped = wrapElement("button", raw, getActiveContext(), ["click", "read"]);

    await wrapped.click();
    await wrapped.read();
    await wrapped.isVisible();
    await wrapped.waitForHidden();
    await (wrapped as any).withTimeout();
    await (wrapped as any).locator();

    // Only the two declared actions should have entered middleware
    expect(calls).toEqual(["click", "read"]);
  });

  test("ACTIONS symbol can be set directly on element", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(ctx.action);
      return next();
    });

    const raw: Record<string, unknown> = {
      async click() { return "clicked"; },
      async isVisible() { return true; },
    };
    (raw as any)[ACTIONS] = new Set(["click"]);

    const wrapped = wrapElement("button", raw, getActiveContext());

    await (wrapped as any).click();
    await (wrapped as any).isVisible();

    expect(calls).toEqual(["click"]);
  });

  test("no actions and no ACTIONS symbol means nothing is wrapped", async () => {
    const calls: string[] = [];
    useMiddleware(async (ctx, next) => {
      calls.push(ctx.action);
      return next();
    });

    // No actions parameter and no ACTIONS symbol → nothing wrapped
    const raw = {
      async click() { return "clicked"; },
      async isVisible() { return true; },
      async withTimeout() { return raw; },
      async locator() { return "loc"; },
    };
    const wrapped = wrapElement("button", raw, getActiveContext());

    await wrapped.click();
    await wrapped.isVisible();
    await (wrapped as any).withTimeout();
    await (wrapped as any).locator();

    // No ACTIONS declared, so nothing goes through middleware.
    expect(calls).toEqual([]);
  });

  test("forceMiddleware: true overrides nested-action guard for cross-element calls", async () => {
    const actions: string[] = [];
    useMiddleware(async (ctx, next) => {
      actions.push(ctx.action);
      return next();
    });

    // Simulate cross-element interaction: element A's action triggers
    // element B's action in the same async chain.  Normally the
    // nested-action guard suppresses middleware for the inner call.
    const innerElement = {
      async read() { return "toast-message"; },
    };
    const wrappedInner = wrapElement("toast", innerElement, getActiveContext(), ["read"]);

    const outerElement = {
      async click() {
        // Cross-element call — would normally be suppressed by
        // the nested-action guard, but forceMiddleware overrides it.
        return wrappedInner.read();
      },
    };
    const wrappedOuter = wrapElement("button", outerElement, getActiveContext(), ["click"]);

    // Without forceMiddleware, only "click" would appear in actions.
    // The inner read() is still suppressed because the default
    // ActionContext built by wrapElement doesn't set forceMiddleware.
    await wrappedOuter.click();
    expect(actions).toEqual(["click"]);

    // Now test with forceMiddleware: true via runAction directly.
    actions.length = 0;
    const pipeline = getActiveContext().middleware;

    // Outer action enters the pipeline normally.
    await pipeline.runAction(
      { elementType: "button", action: "click", args: [], startTime: Date.now() },
      async () => {
        // Inner action with forceMiddleware: true — should NOT be suppressed.
        return pipeline.runAction(
          { elementType: "toast", action: "read", args: [], startTime: Date.now(), forceMiddleware: true },
          async () => "toast-message",
        );
      },
    );
    expect(actions).toEqual(["click", "read"]);
  });

  test("nested calls without forceMiddleware are still suppressed (default behavior)", async () => {
    const actions: string[] = [];
    useMiddleware(async (ctx, next) => {
      actions.push(ctx.action);
      return next();
    });

    const pipeline = getActiveContext().middleware;

    await pipeline.runAction(
      { elementType: "group", action: "writeAll", args: [], startTime: Date.now() },
      async () => {
        // Inner call without forceMiddleware — should be suppressed.
        await pipeline.runAction(
          { elementType: "input", action: "set", args: [], startTime: Date.now() },
          async () => "done",
        );
        return undefined;
      },
    );
    expect(actions).toEqual(["writeAll"]);
  });

  test("forceMiddleware in WrapElementMeta bypasses nested-action guard for wrapped elements", async () => {
    const actions: string[] = [];
    useMiddleware(async (ctx, next) => {
      actions.push(`${ctx.elementType}:${ctx.action}`);
      return next();
    });

    // Inner element wrapped with forceMiddleware: true via meta —
    // should always pass through middleware even when called from
    // within another middleware-wrapped action.
    const innerElement = {
      async read() { return "toast-message"; },
    };
    const wrappedInner = wrapElement(
      "toast", innerElement, getActiveContext(), ["read"],
      { forceMiddleware: true },
    );

    // Outer element — normal wrapping, no forceMiddleware.
    const outerElement = {
      async click() {
        // Cross-element call: button click triggers toast read.
        return wrappedInner.read();
      },
    };
    const wrappedOuter = wrapElement("button", outerElement, getActiveContext(), ["click"]);

    await wrappedOuter.click();
    // Both actions appear because the inner element has forceMiddleware.
    expect(actions).toEqual(["button:click", "toast:read"]);
  });

  test("without forceMiddleware in meta, nested wrapped element calls are suppressed", async () => {
    const actions: string[] = [];
    useMiddleware(async (ctx, next) => {
      actions.push(`${ctx.elementType}:${ctx.action}`);
      return next();
    });

    // Inner element without forceMiddleware.
    const innerElement = {
      async read() { return "toast-message"; },
    };
    const wrappedInner = wrapElement("toast", innerElement, getActiveContext(), ["read"]);

    const outerElement = {
      async click() {
        return wrappedInner.read();
      },
    };
    const wrappedOuter = wrapElement("button", outerElement, getActiveContext(), ["click"]);

    await wrappedOuter.click();
    // Only the outer action triggers middleware; inner is suppressed by the guard.
    expect(actions).toEqual(["button:click"]);
  });
});

// ── wrapElement: action-name typo detection ─────────────────

test.describe("wrapElement action-name validation", () => {
  test("throws for typo in action name", () => {
    const element = {
      async click() { return; },
      async read() { return "value"; },
    };
    expect(() =>
      wrapElement("button", element, getActiveContext(), ["clcik" as keyof typeof element]),
    ).toThrow(/action "clcik" is not a function/);
  });

  test("error message lists available methods", () => {
    const element = {
      async click() { return; },
      async read() { return "value"; },
    };
    expect(() =>
      wrapElement("input", element, getActiveContext(), ["raed" as keyof typeof element]),
    ).toThrow(/Available methods: \[click, read\]/);
  });

  test("valid action names do not throw", () => {
    const element = {
      async click() { return; },
      async read() { return "value"; },
    };
    expect(() =>
      wrapElement("button", element, getActiveContext(), ["click", "read"]),
    ).not.toThrow();
  });
});
