/**
 * Shared type definitions for the group element module.
 *
 * Extracted to break circular dependencies between group.ts and its
 * extracted method builders (group-batch, group-find, group-override).
 */

import type { Locator } from "@playwright/test";
import type { HandlerActions, ValueKind, ValueKindMap, ActionOptions, LabelActionOptions } from "../handler-types.js";
import type { IFrameworkContext } from "../types.js";
import type { BaseElement } from "./base.js";

// ── Public types ────────────────────────────────────────────

/** Dictionary of label → value pairs for batch operations. */
export type FieldValues = Record<string, string | boolean | string[]>;

export interface GroupElement extends BaseElement<GroupElement> {
  /**
   * Write a value to an element found by its label within this container.
   * The element type is auto-detected via the handler registry —
   * checkboxes, selects, radios, ARIA widgets, etc. are all handled.
   *
   * **Semantics note:** `write()` uses the handler registry's
   * direct-interaction strategy (e.g. `fill()` for text inputs,
   * `selectOption()` for selects). This may differ from typed wrappers
   * which sometimes simulate user-level interactions (e.g.
   * `stepper.set()` clicks increment/decrement buttons). Use typed
   * wrappers when you need specific interaction semantics.
   */
  write(label: string, value: string | boolean | string[], options?: LabelActionOptions): Promise<void>;

  /**
   * Read the current value of an element found by its label within this container.
   *
   * **Return type:** The runtime type depends on the matched handler:
   * - `boolean` for checkboxes and switches
   * - `string[]` for checkbox groups
   * - `string` for everything else (text inputs, selects, radios, etc.)
   *
   * Use the type-narrowing helpers (`asString()`, `asNumber()`,
   * `asBoolean()`, `asStringArray()`) when you need a specific type.
   * For compile-time typed returns, prefer typed wrappers
   * (e.g. `stepper.read() → number`).
   */
  read(label: string, options?: LabelActionOptions): Promise<string | boolean | string[]>;

  /**
   * Read the current value with a compile-time narrowed return type.
   *
   * When the matched handler declares a {@link ValueKind}, the return
   * type is narrowed accordingly.  This avoids manual coercion at every
   * call site:
   *
   * ```ts
   * const name = await form.readTyped<string>("Name");
   * const agreed = await form.readTyped<boolean>("Terms");
   * const tags = await form.readTyped<string[]>("Tags");
   * ```
   *
   * At runtime, the value is validated against the handler's
   * `valueKind` (if declared) and a `TypeError` is thrown on
   * mismatch.  If the handler has no `valueKind`, the value is
   * returned as-is with a type assertion.
   */
  readTyped<K extends ValueKind>(
    label: string,
    kind: K,
    options?: LabelActionOptions,
  ): Promise<ValueKindMap[K]>;

  /**
   * Apply a dictionary of label → value pairs to this container.
   * Each entry calls write(label, value) sequentially.
   */
  writeAll(fields: FieldValues, options?: LabelActionOptions): Promise<void>;

  /**
   * Read the current values for the given labels from this container.
   * Returns a dictionary of label → value.
   */
  readAll(labels: string[], options?: LabelActionOptions): Promise<FieldValues>;

  /**
   * Narrow from multiple matching containers to the one containing
   * the given `text` (exact match).
   * Returns a new GroupElement scoped to the matched container.
   * Throws if 0 or >1 containers match.
   */
  find(text: string, options?: ActionOptions): Promise<GroupElement>;

  /**
   * Click a button or link within this container by its visible text.
   */
  click(text: string, options?: ActionOptions): Promise<void>;

  /**
   * Override the auto-detected handler for a specific label.
   *
   * By default, `write()` and `read()` auto-detect element types via
   * the handler registry. This method lets you force a specific handler
   * for a given label — useful when auto-detection picks the wrong
   * strategy (e.g. a `spinbutton` input where `fill()` works, but you
   * want click-based increment/decrement semantics from a custom handler).
   *
   * @param label    The label text to override (must match exactly what
   *                 you'd pass to `read()`/`write()`).
   * @param handler  Either:
   *   - A **string** — the `type` name of a registered handler
   *     (e.g. `"select"`, `"checkbox"`, `"combobox"`).
   *   - A **{@link HandlerActions}** object — custom `set()` / `get()`
   *     functions for full control.
   * @returns A new `GroupElement` with the override applied (immutable
   *          builder pattern). Capture the return value or chain calls —
   *          calling `form.overrideHandler(...)` without capturing the
   *          result silently discards the override.
   * @throws If a string is provided and no handler with that type name
   *         is found in the registry.
   *
   * @example
   * ```ts
   * const form = group(By.css("form"), page)
   *   .overrideHandler("Quantity", "stepper")
   *   .overrideHandler("Color", {
   *     async set(el, value, opts) { … },
   *     async get(el, opts) { … },
   *   });
   *
   * await form.write("Quantity", "5"); // uses "stepper" handler
   * ```
   */
  overrideHandler(label: string, handler: string | HandlerActions): GroupElement;
}

// ── Internal shared dependency bag ──────────────────────────

/**
 * Shared dependencies passed to extracted group method builders.
 *
 * Bundles the closure variables that `buildGroupElement` used to
 * capture, so that extracted functions (batch, find, override)
 * can access them without creating circular imports with group.ts.
 */
export interface GroupMethodDeps {
  /** Async locator resolution (awaitable). */
  loc: () => Promise<Locator>;
  /** Effective timeout: per-call override → builder default → undefined. */
  t: (options?: ActionOptions) => number | undefined;
  /** Resolved framework context. */
  ctx: IFrameworkContext;
  /** Label → HandlerActions override map. */
  handlerOverrides: Map<string, HandlerActions>;
  /** Default timeout (ms) for child elements / rebuild. */
  defaultTimeout?: number;
  /** Original locator provider (may be sync). */
  locProvider: () => Locator | Promise<Locator>;
  /** Human-readable By descriptor. */
  byDescriptor?: string;
}

/**
 * Callback signature for building a new GroupElement.
 *
 * Used by extracted method builders (find, override) to create scoped
 * or reconfigured GroupElements without a direct import of
 * `buildGroupElement` (which would cause circular dependencies).
 *
 * The parameter list is extracted as {@link BuildGroupParams} so that
 * a single source of truth exists.  A compile-time assertion in
 * `group.ts` ensures `buildGroupElement` stays in sync.
 */
export type BuildGroupParams = [
  getLoc: () => Locator | Promise<Locator>,
  defaultTimeout: number | undefined,
  handlerOverrides: Map<string, HandlerActions>,
  fwCtx: IFrameworkContext,
  byDescriptor?: string,
];

export type BuildGroupFn = (...args: BuildGroupParams) => GroupElement;
