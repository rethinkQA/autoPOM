/**
 * Handler-related type definitions.
 *
 * Contains detection rules, handler interfaces, action options,
 * value-kind discriminators, and handler positioning types used
 * by the element handler subsystem.
 *
 * This module has no runtime project imports — only type-level
 * imports from external packages (e.g. `@playwright/test`).
 */

import type { Locator } from "@playwright/test";

// ── Action Options ──────────────────────────────────────────

/** Per-call overrides accepted by element wrapper methods. */
export interface ActionOptions {
  /** Override the timeout (in milliseconds) for this single operation. */
  timeout?: number;
}

/**
 * Extended action options for methods that resolve radio/checkbox labels.
 *
 * Currently identical to {@link ActionOptions}. Retained as a named
 * sub-type so that call sites that deal with radio/checkbox labels
 * remain semantically distinct from generic element operations.
 */
export type LabelActionOptions = ActionOptions;

// ── Value kind ─────────────────────────────────────────────

/**
 * Discriminator for the runtime type returned by a handler's `get()`.
 *
 * Used by {@link GroupElement.readTyped} to provide narrowed return
 * types without manual coercion at every call site.
 */
export type ValueKind = "string" | "boolean" | "string[]";

/** Maps a {@link ValueKind} discriminator to its TypeScript type. */
export type ValueKindMap = {
  "string": string;
  "boolean": boolean;
  "string[]": string[];
};

// ── Handler types ───────────────────────────────────────────

/**
 * Serialisable rule describing which DOM nodes a handler matches.
 * All fields are optional; at least one primary criterion
 * (tags, roles, or attr) must match.
 *
 * These rules are **serialised** and sent into `evaluate()` for
 * in-browser matching. They must contain only plain data —
 * no functions, Locators, or other non-serialisable values.
 *
 * At least one primary criterion (`tags`, `roles`, or `attr`) is
 * required at the type level — an empty `{}` is a compile-time error.
 */
interface DetectRuleBase {
  /** Match by tagName (lowercased). */
  tags?: string[];
  /** For `<input>` elements, match by `type` attribute. */
  inputTypes?: string[];
  /** Match by the `role` attribute. */
  roles?: string[];
  /** Node must contain a child matching this CSS selector. */
  requireChild?: string;
  /** [name, value] — node must have this attribute set to this value. */
  attr?: [string, string];
}

/**
 * A {@link DetectRuleBase} that requires at least one primary criterion.
 * This prevents `{}` from being a valid `DetectRule` at compile time.
 */
export type DetectRule = DetectRuleBase &
  ({ tags: string[] } | { roles: string[] } | { attr: [string, string] });

/**
 * Serialisable identity + detection rules for a handler.
 * This is the only part sent into `evaluate()` — it must contain
 * no functions, Locators, or other non-serialisable values.
 */
export interface HandlerDetection {
  /** Identifier for debugging / logging. */
  type: string;
  /** One or more detection rules — any single rule matching is enough. */
  detect: DetectRule[];
}

/** The full union of all values that handlers may accept or return. */
export type HandlerValue = string | boolean | string[];

/**
 * Non-serialisable action functions that run in Node against
 * Playwright Locators. Never sent into `evaluate()`.
 *
 * Generic parameters allow individual handlers to declare narrow
 * input/output types at compile time:
 *
 * ```ts
 * // A handler that only accepts booleans and returns booleans:
 * const myHandler: HandlerActions<boolean, boolean> = { … };
 * ```
 *
 * The polymorphic registry ({@link ElementHandler}) uses the default
 * full-union parameters, so no downstream changes are required.
 */
export interface HandlerActions<
  TSet extends HandlerValue = HandlerValue,
  TGet extends HandlerValue = HandlerValue,
> {
  /** Write `value` into the element. */
  set(el: Locator, value: TSet, options?: ActionOptions): Promise<void>;
  /** Read the element's current value. */
  get(el: Locator, options?: ActionOptions): Promise<TGet>;
  /**
   * Declares the value type(s) this handler's `set()` expects.
   *
   * Used by `group.write()` to validate caller-supplied values at the
   * dispatch boundary — catching mismatches (e.g. passing a string to a
   * checkbox handler) before they silently fail inside the handler.
   *
   * Built-in {@link ElementHandler}s always carry this field.  Custom
   * overrides may omit it for backwards compatibility, but providing it
   * is strongly recommended.
   */
  expectedValueType?: ("string" | "boolean" | "string[]")[];
  /**
   * Declares the runtime type returned by this handler's `get()` method.
   *
   * Used by {@link GroupElement.readTyped} to provide compile-time typed
   * returns without manual coercion.  Built-in handlers always set this;
   * custom overrides may omit it (falls back to the full union).
   */
  valueKind?: ValueKind;
}

/**
 * Pluggable handler that teaches the group element how to interact
 * with a specific kind of form control.
 *
 * Handlers are registered in priority order — first match wins.
 *
 * Composed of two halves:
 * - {@link HandlerDetection} — serialisable identity + detection rules
 *   (sent into `evaluate()` for in-browser classification).
 * - {@link HandlerActions} — non-serialisable `set()`/`get()` functions
 *   (run in Node via Playwright Locators).
 *
 * Uses the default (full-union) generic parameters so that the handler
 * registry can hold heterogeneous handlers in a single collection.
 * Individual handlers can be authored with narrower types via
 * `HandlerActions<TSet, TGet>` and will widen automatically when
 * stored into an `ElementHandler[]`.
 */
export interface ElementHandler extends HandlerDetection, HandlerActions {}

/**
 * Position options for {@link registerHandler}.
 *
 * - `"first"` — inserts at index 0 (highest priority).
 * - `"last"`  — inserts just **before** the final catch-all
 *   `input` handler (the catch-all fallback), so the fallback always
 *   remains last.  This means `"last"` is effectively "last among
 *   custom handlers", not the absolute end of the array.
 * - `{ before: type }` / `{ after: type }` — relative to the named handler.
 */
export type HandlerPosition =
  | { before: string }   // Insert before the handler with this type name
  | { after: string }    // Insert after the handler with this type name
  | "first"              // Highest priority (index 0)
  | "last";              // Just before the generic-input fallback (see JSDoc above)
