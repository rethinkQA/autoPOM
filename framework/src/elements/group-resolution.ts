/**
 * Resolution helpers extracted from group.ts to reduce its dependency surface.
 *
 * Owns:
 *  - Single-label resolution with handler override lookup (resolveSingle)
 *  - Batch-scoped resolve cache (resolveWithCache)
 *  - Value-type validation (validateValueType)
 */

import type { Locator } from "@playwright/test";
import type { ElementHandler, HandlerActions, ValueKind } from "../handler-types.js";
import type { IFrameworkContext } from "../types.js";
import { resolveLabeled } from "../label-resolution.js";

// ── Types ──────────────────────────────────────────────────

/** A resolved element paired with its handler (auto-detected or overridden). */
export type CacheEntry = { el: Locator; handler: ElementHandler | HandlerActions };

// ── Value-type validation ──────────────────────────────────

/** Classify the runtime type of a value for handler validation. */
function classifyValueType(value: string | boolean | string[]): "string" | "boolean" | "string[]" {
  if (Array.isArray(value)) return "string[]";
  return typeof value as "string" | "boolean";
}

/**
 * Validate that `value` is an acceptable type for the resolved handler.
 * Only fires when the handler declares `expectedValueType`; custom
 * handlers without the field are left unchecked for backwards compat.
 */
export function validateValueType(
  label: string,
  value: string | boolean | string[],
  handler: ElementHandler | HandlerActions,
): void {
  if (!handler.expectedValueType) return;

  const actual = classifyValueType(value);
  if (!handler.expectedValueType.includes(actual)) {
    const handlerName = "type" in handler ? handler.type : "custom override";
    throw new TypeError(
      `group.write("${label}"): handler "${handlerName}" expects ` +
      `value of type ${handler.expectedValueType.join(" | ")}, ` +
      `but received ${actual} (${JSON.stringify(value)}).`,
    );
  }
}

/**
 * Post-read assertion: verify the actual runtime type of a value returned
 * by `handler.get()` matches the expected {@link ValueKind}.
 *
 * This prevents corrupt data from silently propagating when a custom
 * handler's `get()` returns the wrong type (e.g., a string instead of a
 * boolean for a checkbox override).
 */
export function validateReturnedValue(
  label: string,
  value: unknown,
  expectedKind: ValueKind,
  handler: ElementHandler | HandlerActions,
  callerName: string = "readTyped",
): void {
  const actualKind = classifyRuntimeKind(value);
  if (actualKind !== expectedKind) {
    const handlerName = "type" in handler ? handler.type : "custom override";
    throw new TypeError(
      `group.${callerName}("${label}", "${expectedKind}"): handler "${handlerName}" ` +
      `returned a value of type ${actualKind} (${JSON.stringify(value)}), ` +
      `expected ${expectedKind}.`,
    );
  }
}

/**
 * Like {@link classifyValueType} but accepts `unknown` and returns a
 * human-readable string even for unexpected types.
 */
function classifyRuntimeKind(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) return "string[]";
    throw new TypeError(
      `group arrays must contain only strings, got: ${typeof value[0]}`,
    );
  }
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return typeof value;
}

// ── Single-label resolution ────────────────────────────────

/**
 * Resolve one label within a container, applying any handler override.
 */
export async function resolveSingle(
  container: Locator,
  label: string,
  ctx: IFrameworkContext,
  handlerOverrides: Map<string, HandlerActions>,
  timeout?: number,
): Promise<CacheEntry> {
  const resolved = await resolveLabeled(container, label, ctx, timeout);

  const override = handlerOverrides.get(label);
  return override
    ? { el: resolved.el, handler: override }
    : resolved;
}

// ── Batch-scoped resolve cache ─────────────────────────────

/**
 * Reuse resolutions within a single batch operation (writeAll/readAll)
 * to avoid duplicate detection work for repeated labels.
 *
 * The cache stores **Promises** (not resolved values) so that
 * concurrent callers for the same label in a Promise.all fan-out
 * deduplicate correctly.
 */
export function resolveWithCache(
  container: Locator,
  label: string,
  cache: Map<string, Promise<CacheEntry>>,
  ctx: IFrameworkContext,
  handlerOverrides: Map<string, HandlerActions>,
  timeout?: number,
): Promise<CacheEntry> {
  const cached = cache.get(label);
  if (cached) return cached;

  const promise = resolveSingle(container, label, ctx, handlerOverrides, timeout);
  cache.set(label, promise);
  return promise;
}
