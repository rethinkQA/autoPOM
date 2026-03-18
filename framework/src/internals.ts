/**
 * Internal implementation classes and utilities.
 *
 * These are **not** part of the stable public API.  Import from
 * `"@playwright-elements/core/internals"` only when you need direct
 * access to concrete implementation details (e.g. for testing,
 * custom tooling, or advanced extension scenarios).
 *
 * **No semver guarantees** are made for exports in this module —
 * constructor signatures, method names, and internal algorithms may
 * change between minor releases.
 */

// Concrete implementation classes
export { HandlerRegistry } from "./handler-registry.js";
export { MiddlewarePipeline } from "./middleware-pipeline.js";
export { LoggerConfig } from "./logger-config.js";
export { ResolveRetryConfig } from "./resolve-retry-config.js";

// Internal algorithm & types
export { classifyElement, type SerializedEntry } from "./element-classifier.js";
