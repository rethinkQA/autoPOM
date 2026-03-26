/**
 * Group `overrideHandler` builder — immutable builder pattern
 * for overriding the auto-detected handler for specific labels.
 *
 * Extracted from group.ts as a standalone decorator.
 */

import type { HandlerActions } from "../handler-types.js";
import type { GroupElement, GroupMethodDeps, BuildGroupFn } from "./group-types.js";

/**
 * Create the `overrideHandler` method for a GroupElement.
 *
 * Returns an immutable builder: resolving the handler string (if any),
 * creating a new overrides Map, and returning a fresh GroupElement
 * so shared state is never mutated.
 *
 * **Important:** The returned GroupElement is a *new* instance —
 * callers MUST use the return value. Calling `group.overrideHandler()`
 * without capturing the result is a no-op.
 *
 * ```ts
 * // ✅ Correct — captures the new group
 * const g2 = group.overrideHandler("Email", "input");
 * // ❌ Bug — discarded return value, original group unchanged
 * group.overrideHandler("Email", "input");
 * ```
 */
export function createGroupOverride(
  deps: GroupMethodDeps,
  buildGroup: BuildGroupFn,
): (label: string, handler: string | HandlerActions) => GroupElement {
  return function overrideHandler(label: string, handler: string | HandlerActions): GroupElement {
    let resolved: HandlerActions;
    if (typeof handler === "string") {
      const found = deps.ctx.handlers.getHandlerByType(handler);
      if (!found) {
        throw new Error(
          `overrideHandler: no registered handler with type "${handler}". ` +
          `Available types: ${deps.ctx.handlers.handlers.map((h) => h.type).join(", ")}.`,
        );
      }
      resolved = found;
    } else {
      if (typeof handler.get !== "function") {
        throw new Error(
          `overrideHandler("${label}"): handler.get must be a function.`,
        );
      }
      if (typeof handler.set !== "function") {
        throw new Error(
          `overrideHandler("${label}"): handler.set must be a function.`,
        );
      }
      resolved = handler;
    }

    // Immutable builder: create a new Map and return a fresh wrapped
    // GroupElement so we never mutate shared state and the returned
    // reference always goes through the middleware pipeline.
    const newOverrides = new Map(deps.handlerOverrides);
    newOverrides.set(label, resolved);
    return buildGroup(
      deps.locProvider,
      deps.defaultTimeout,
      newOverrides,
      deps.ctx,
      deps.byDescriptor,
    );
  };
}
