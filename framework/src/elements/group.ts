import { By, type Scope } from "../by.js";
import type { Locator } from "@playwright/test";
import type { HandlerActions, ValueKind, ValueKindMap } from "../handler-types.js";
import type { ActionOptions, LabelActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { clickInContainer } from "../dom-helpers.js";
import { buildElementFromProvider } from "./base.js";
import { getActiveContext } from "../context.js";
import type { IFrameworkContext } from "../types.js";
import { wrapElement } from "../wrap-element.js";
import { resolveSingle, validateValueType, validateReturnedValue } from "./group-resolution.js";

// Extracted method builders (Issue 4: reduced responsibilities)
import { createBatchWrite, createBatchRead } from "./group-batch.js";
import { createGroupFind } from "./group-find.js";
import { createGroupOverride } from "./group-override.js";

// Re-export public types from group-types (backward-compat)
export type { GroupElement, FieldValues } from "./group-types.js";
import type { GroupElement, GroupMethodDeps } from "./group-types.js";
import type { BuildGroupFn } from "./group-types.js";

// Re-export coercion helpers for backwards-compatible named imports
export { asString, asNumber, asBoolean, asStringArray } from "./coercion.js";

/**
 * Core implementation shared by group() and the internal
 * scoped groups returned by find().
 */
function buildGroupElement(
  getLoc: () => Locator | Promise<Locator>,
  defaultTimeout: number | undefined,
  handlerOverrides: Map<string, HandlerActions>,
  fwCtx: IFrameworkContext,
  byDescriptor?: string,
): GroupElement {
  // Use the standard element infrastructure builder — same wiring as
  // every other element factory.
  const { loc, t, base, ctx, meta } = buildElementFromProvider<GroupElement>({
    locProvider: getLoc,
    rebuild: (ms) => buildGroupElement(getLoc, ms, handlerOverrides, fwCtx, byDescriptor),
    defaultTimeout,
    context: fwCtx,
    byDescriptor,
  });

  // Shared dependency bag for extracted method builders.
  const deps: GroupMethodDeps = {
    loc, t, ctx, handlerOverrides, defaultTimeout,
    locProvider: getLoc,
    byDescriptor,
  };

  const element: GroupElement = wrapElement("group", {
    ...base,

    // ── Single-field operations (kept inline — small & core) ──

    async write(label: string, value: string | boolean | string[], options?: LabelActionOptions) {
      const timeout = t(options);
      const container = await loc();
      const { el, handler } = await resolveSingle(container, label, ctx, handlerOverrides, timeout);
      validateValueType(label, value, handler);
      await handler.set(el, value, { timeout });
    },

    async read(label: string, options?: LabelActionOptions) {
      const timeout = t(options);
      const container = await loc();
      const { el, handler } = await resolveSingle(container, label, ctx, handlerOverrides, timeout);
      const value = await handler.get(el, { timeout });
      if (handler.valueKind) {
        validateReturnedValue(label, value, handler.valueKind, handler);
      }
      return value;
    },

    async readTyped<K extends ValueKind>(
      label: string,
      kind: K,
      options?: LabelActionOptions,
    ): Promise<ValueKindMap[K]> {
      const timeout = t(options);
      const container = await loc();
      const { el, handler } = await resolveSingle(container, label, ctx, handlerOverrides, timeout);
      const value = await handler.get(el, { timeout });

      // Runtime validation: if the handler declares a valueKind,
      // verify it matches the caller's expectation.
      const actual = handler.valueKind;
      if (actual && actual !== kind) {
        const handlerName = "type" in handler ? (handler as { type: string }).type : "custom override";
        throw new TypeError(
          `group.readTyped("${label}", "${kind}"): handler "${handlerName}" ` +
          `returns ${actual}, not ${kind}.`,
        );
      }

      validateReturnedValue(label, value, kind, handler);
      return value as ValueKindMap[K];
    },

    // ── Batch operations (extracted to group-batch.ts) ────────

    writeAll: createBatchWrite(deps),
    readAll: createBatchRead(deps),

    // ── Find combinator (extracted to group-find.ts) ──────────

    find: createGroupFind(deps, buildGroupElement),

    // ── Click ─────────────────────────────────────────────────

    async click(text: string, options?: ActionOptions) {
      const container = await loc();
      await clickInContainer(container, text, {
        timeout: t(options),
      });
    },

    // ── Override builder (extracted to group-override.ts) ─────

    overrideHandler: createGroupOverride(deps, buildGroupElement),

  }, ctx, ["write", "read", "readTyped", "writeAll", "readAll", "find", "click"], meta);

  return element;
}

// Compile-time check: buildGroupElement must satisfy BuildGroupFn.
// If the parameter list drifts, TypeScript will error here.
const _assertBuildGroupFn: BuildGroupFn = buildGroupElement;
void _assertBuildGroupFn;

/**
 * Create a group element wrapper — the primary entry point for
 * label-based, auto-detecting form interactions.
 *
 * A group scopes a region of the page (e.g. a form, a dialog, or
 * `body`) and lets you `write(label, value)` / `read(label)` on any
 * DOM element the handler registry can classify.
 *
 * @param by    - Locator strategy for the group container (e.g. `By.css("body")`).
 * @param scope - Page or parent locator to search within.
 *
 * @example
 * ```ts
 * const form = group(By.css("body"), page);
 * await form.write("Category", "Electronics");
 * const value = await form.read("Category");
 * ```
 */
export function group(by: By, scope: Scope, options?: ElementOptions): GroupElement {
  const fwCtx = options?.context ?? getActiveContext();
  const getLoc = () => by.resolve(scope, fwCtx.logger.getLogger());
  return buildGroupElement(
    getLoc,
    options?.timeout,
    new Map(),
    fwCtx,
    by.toString(),
  );
}
