/**
 * Batch operations for the group element (writeAll / readAll).
 *
 * Extracted from group.ts to reduce its responsibilities.
 * Each function is a factory that returns an async method
 * suitable for composing into a GroupElement.
 */

import type { LabelActionOptions } from "../handler-types.js";
import type { FieldValues, GroupMethodDeps } from "./group-types.js";
import { resolveWithCache, validateValueType, validateReturnedValue, type CacheEntry } from "./group-resolution.js";

/**
 * Create the `writeAll` method for a GroupElement.
 *
 * Resolves all labels in parallel (the expensive retry-based detection),
 * then validates types and writes sequentially (writes may have ordering
 * dependencies or shared DOM side-effects).
 */
export function createBatchWrite(
  deps: GroupMethodDeps,
): (fields: FieldValues, options?: LabelActionOptions) => Promise<void> {
  return async function writeAll(fields: FieldValues, options?: LabelActionOptions): Promise<void> {
    const cache = new Map<string, Promise<CacheEntry>>();
    const timeout = deps.t(options);
    const entries = Object.entries(fields);
    const container = await deps.loc();

    // Phase 1: Resolve all labels in parallel (the expensive part —
    // resolveLabeled involves retry loops and count() calls).
    const resolved = await Promise.all(
      entries.map(([label]) =>
        resolveWithCache(container, label, cache, deps.ctx, deps.handlerOverrides, timeout),
      ),
    );

    // Phase 2: Validate types and write sequentially (writes may have
    // ordering dependencies or shared DOM side-effects).
    // Re-detect the handler before each write because a prior write may
    // have changed the element's type (e.g. toggling a checkbox that
    // swaps a text input to a select). Re-using the Phase 1 handler
    // would invoke the wrong set() function (P1-75).
    for (let i = 0; i < entries.length; i++) {
      const [label, value] = entries[i];
      const { el } = resolved[i];
      let { handler } = resolved[i];
      // Re-detect if the context supports it (auto-detected handlers only)
      if ("type" in handler && deps.ctx.handlers.detectHandler) {
        try {
          const fresh = await deps.ctx.handlers.detectHandler(el);
          handler = fresh;
        } catch {
          // Detection failed — fall back to Phase 1 handler.
        }
      }
      validateValueType(label, value, handler);
      await handler.set(el, value, { timeout });
    }
  };
}

/**
 * Create the `readAll` method for a GroupElement.
 *
 * Resolves all labels in parallel, then reads sequentially to avoid
 * races when parallel handler.get() calls target shared DOM elements.
 */
export function createBatchRead(
  deps: GroupMethodDeps,
): (labels: string[], options?: LabelActionOptions) => Promise<FieldValues> {
  return async function readAll(labels: string[], options?: LabelActionOptions): Promise<FieldValues> {
    const cache = new Map<string, Promise<CacheEntry>>();
    const timeout = deps.t(options);
    const container = await deps.loc();

    // Phase 1: Resolve all labels in parallel (resolution is the
    // expensive part — resolveLabeled involves retry loops).
    const resolved = await Promise.all(
      labels.map((label) =>
        resolveWithCache(container, label, cache, deps.ctx, deps.handlerOverrides, timeout),
      ),
    );

    // Phase 2: Read sequentially to avoid races when parallel
    // handler.get() calls target shared DOM elements.
    const result: FieldValues = {};
    for (let i = 0; i < labels.length; i++) {
      const { el, handler } = resolved[i];
      const value = await handler.get(el, { timeout });

      // When the handler declares a valueKind, validate that the
      // actual returned value matches — catches buggy get() impls
      // before they corrupt the FieldValues dictionary.
      if (handler.valueKind) {
        validateReturnedValue(labels[i], value, handler.valueKind, handler, "readAll");
      }

      result[labels[i]] = value;
    }
    return result;
  };
}
