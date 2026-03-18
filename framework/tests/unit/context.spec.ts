import { test, expect } from "../../src/test-fixture.js";
import { createFrameworkContext, defaultContext, getActiveContext } from "../../src/context.js";
import { wrapElement } from "../../src/wrap-element.js";
import { getHandlers, registerHandler, resetHandlers } from "../../src/defaults.js";
import type { ElementHandler } from "../../src/handler-types.js";

// Ensures isolated contexts do not mutate the defaultContext singletons

test("isolated handler registry does not touch defaultContext", () => {
  const ctx = createFrameworkContext();
  const stub: ElementHandler = {
    type: "isolated-widget",
    detect: [{ tags: ["isolated-widget"] }],
    async set() {},
    async get() { return ""; },
  };

  const defaultCount = defaultContext.handlers.handlers.length;
  expect(defaultContext.handlers.getHandlerByType(stub.type)).toBeUndefined();

  ctx.handlers.registerHandler(stub, "first");
  expect(ctx.handlers.getHandlerByType(stub.type)?.type).toBe(stub.type);

  // Default context remains unchanged
  expect(defaultContext.handlers.getHandlerByType(stub.type)).toBeUndefined();
  expect(defaultContext.handlers.handlers.length).toBe(defaultCount);
});

test("middleware isolation between contexts", async () => {
  const ctx = createFrameworkContext();
  const calls: string[] = [];

  ctx.middleware.useMiddleware(async (actionCtx, next) => {
    calls.push(`mw:${actionCtx.action}`);
    return next();
  });

  const wrappedIsolated = wrapElement("button", {
    async click() {
      calls.push("click");
    },
  }, ctx, ["click"]);

  await wrappedIsolated.click();
  expect(calls).toEqual(["mw:click", "click"]);

  const defaultCalls: string[] = [];
  const wrappedDefault = wrapElement("button", {
    async click() {
      defaultCalls.push("click");
    },
  }, getActiveContext(), ["click"]);

  await wrappedDefault.click();
  expect(defaultCalls).toEqual(["click"]);
});

test("getHandlers() reflects defaultContext after reset", () => {
  // Snapshot the initial state
  const initialLength = getHandlers().length;
  const initialTypes = getHandlers().map((h) => h.type);

  // Register a custom handler and verify getHandlers sees it
  const stub: ElementHandler = {
    type: "get-handlers-reset-widget",
    detect: [{ tags: ["get-handlers-reset-widget"] }],
    async set() {},
    async get() { return ""; },
  };

  registerHandler(stub, "first");
  expect(getHandlers().length).toBe(initialLength + 1);
  expect(getHandlers()[0].type).toBe("get-handlers-reset-widget");

  // After reset, getHandlers must reflect the restored state
  resetHandlers();
  expect(getHandlers().length).toBe(initialLength);
  expect(getHandlers().map((h) => h.type)).toEqual(initialTypes);
});

test("getHandlers() returns the live handler list", () => {
  const initial = getHandlers();
  const initialLength = initial.length;

  const stub: ElementHandler = {
    type: "get-handlers-test",
    detect: [{ tags: ["get-handlers-test"] }],
    async set() {},
    async get() { return ""; },
  };

  registerHandler(stub, "first");
  expect(getHandlers().length).toBe(initialLength + 1);
  expect(getHandlers()[0].type).toBe("get-handlers-test");

  resetHandlers();
  expect(getHandlers().length).toBe(initialLength);
});
