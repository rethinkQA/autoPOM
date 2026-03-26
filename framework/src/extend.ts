/**
 * Extension API surface — tools for extending the framework with
 * custom handlers, middleware, and element wrappers.
 *
 * Import from `"@playwright-elements/core/extend"` when building
 * custom element handlers, middleware, or element factories.
 *
 * For the consumer "write a test" API, import from
 * `"@playwright-elements/core"` instead.
 *
 * ## Pitfalls for extension authors
 *
 * ### Mutation-scope guard only covers the flat API
 *
 * The module-level convenience functions exported here (`registerHandler`,
 * `useMiddleware`, `configureLogger`, etc.) pass through
 * `checkMutationScope()` which warns or throws when called outside an
 * `AsyncLocalStorage` scope (i.e. outside a test fixture).  However,
 * calling `defaultContext.handlers.registerHandler()` (or any method
 * on the collaborator objects directly) **bypasses** the guard entirely.
 *
 * If you hold a direct reference to a context's collaborator, you are
 * responsible for ensuring mutations happen within the correct scope.
 * Prefer the flat convenience functions whenever possible, or use
 * `createFrameworkContext()` to get an isolated context that is safe
 * to mutate without scope guards.
 */

// ── Handler registration (module-level convenience) ─────────

export {
  registerHandler,
  unregisterHandler,
  resetHandlers,
  getHandlerByType,
  getHandlers,
  getRoleFallbacks,
  resetAll,
  runAction,
  getLogger,
} from "./defaults.js";

// ── Handler creation & reusable interaction helpers ─────────

export {
  createHandler,
  getDefaultHandlerByType,
  toggleSet,
  toggleGet,
  fillSet,
  fillGet,
  parseBooleanValue,
} from "./default-handlers.js";
export type { CreateHandlerConfig } from "./default-handlers.js";

// ── Handler types ───────────────────────────────────────────

export type {
  ElementHandler,
  HandlerDetection,
  HandlerActions,
  HandlerValue,
  DetectRule,
  ValueKind,
  ValueKindMap,
  HandlerPosition,
  ActionOptions,
  LabelActionOptions,
} from "./handler-types.js";

// ── Middleware ───────────────────────────────────────────────

export {
  useMiddleware,
  removeMiddleware,
  clearMiddleware,
} from "./defaults.js";

export type {
  Middleware,
  MiddlewarePosition,
  ActionContext,
  NextFn,
} from "./middleware-types.js";

// ── Element wrapping & building blocks ──────────────────────

export { wrapElement, ACTIONS, type WrapElementMeta } from "./wrap-element.js";
export { buildElement, buildElementFromProvider } from "./elements/index.js";
export type {
  BaseElement,
  BuildFromProviderOptions,
} from "./elements/index.js";

// ── DOM helpers for custom adapters / handlers ──────────────

export { cssEscape, clickInContainer, readSelectedOptionText } from "./dom-helpers.js";

// ── Built-in middleware factories ─────────────────────

export { networkSettleMiddleware } from "./network-settle-middleware.js";
export type { NetworkSettleOptions } from "./network-settle-middleware.js";

// ── Error classification extensibility ──────────────────────

export { registerRetryablePattern, resetRetryablePatterns } from "./playwright-errors.js";

// ── Element options ─────────────────────────────────────────

export type { ElementOptions } from "./elements/index.js";

// ── Collaborator interfaces (dependency inversion / test fakes) ──

export type {
  IHandlerRegistry,
  IMiddlewarePipeline,
  ILoggerConfig,
  IResolveRetryConfig,
  AriaRole,
} from "./types.js";
