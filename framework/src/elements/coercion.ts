/**
 * Type-narrowing helpers for values returned by element `read()` /
 * `readAll()` methods. Because group containers resolve the element
 * type at runtime, the static return type is the union
 * `string | boolean | string[]`. These helpers let callers narrow
 * cleanly without manual type assertions.
 *
 * Typed element wrappers (e.g. `stepper.read() → number`,
 * `checkbox.read() → boolean`) return domain-specific types at
 * compile time. Use them when the element type is known ahead of time.
 */

/** Coerce a group read value to `string`. Arrays are joined with `", "`. */
export function asString(value: string | boolean | string[]): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Coerce a group read value to `number`. Throws `TypeError` if not numeric. */
export function asNumber(value: string | boolean | string[]): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new TypeError(
      `asNumber(): cannot convert ${JSON.stringify(value)} to a number`,
    );
  }
  return n;
}

/** Coerce a group read value to `boolean`. Accepts `true`/`false` booleans or strings. Throws `TypeError` otherwise. */
export function asBoolean(value: string | boolean | string[]): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  throw new TypeError(
    `asBoolean(): cannot convert ${JSON.stringify(value)} to a boolean. ` +
    `Expected a boolean value or the string "true"/"false".`,
  );
}

/** Coerce a group read value to `string[]`. Scalars are wrapped in a single-element array. */
export function asStringArray(value: string | boolean | string[]): string[] {
  return Array.isArray(value) ? value : [String(value)];
}
