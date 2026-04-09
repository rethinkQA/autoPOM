/**
 * Built-in element handlers — maps ARIA roles / HTML tags to
 * get/set behaviour used by the framework's detection pipeline.
 *
 * Extracted from `context.ts` so that domain-specific element
 * knowledge stays in the core layer alongside the handler registry.
 */

import type { Locator } from "@playwright/test";
import type { ElementHandler, ActionOptions, DetectRule } from "./handler-types.js";
import { readSelectedOptionText } from "./dom-helpers.js";
import { readCheckedRadioLabel, resolveInputLabel } from "./label-resolution.js";
import { genericNonEditableSelectAdapter } from "./adapters/generic-select-adapter.js";
import { editableSelectAdapter } from "./adapters/editable-select-adapter.js";
import { isRetryableInteractionError, isInterceptedError } from "./playwright-errors.js";
import { getTimeouts } from "./timeouts.js";
import { getActiveContext } from "./context.js";
import { ElementNotFoundError } from "./errors.js";

// ── Stateless interaction helpers ───────────────────────────
// Exported so custom handlers can reuse common behaviours
// without copy-pasting built-in implementations.

/** Convert a string | boolean to a strict boolean for checkbox/switch toggling. */
export function parseBooleanValue(value: string | boolean): boolean {
  if (typeof value === "boolean") return value;
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  throw new TypeError(
    `parseBooleanValue expected a boolean or "true"/"false", got string "${value}"`,
  );
}

export const toggleSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {
  const t = options?.timeout;
  const checked = parseBooleanValue(value);
  const start = Date.now();
  const firstAttemptTimeout = t ?? getTimeouts().toggleFirstAttemptMs;
  // Try normal check first (works for native checkboxes and MUI).
  // Fall back to force:true for shadow DOM overlays (e.g. Shoelace
  // sl-checkbox renders a <span> over the real <input>).
  // P3-178: Only catch interception errors — genuinely invisible or
  // animating elements should NOT be force-clicked.
  try {
    if (checked) { await el.check({ timeout: firstAttemptTimeout }); } else { await el.uncheck({ timeout: firstAttemptTimeout }); }
  } catch (e) {
    if (!isInterceptedError(e)) throw e;
    // Normal check failed (shadow DOM overlay, etc.) — fall back to force:true.
    // Budget the remaining time so total wall-clock doesn't exceed the caller's intent.
    const remaining = t != null ? Math.max(0, t - (Date.now() - start)) : undefined;
    if (checked) { await el.check({ timeout: remaining, force: true }); } else { await el.uncheck({ timeout: remaining, force: true }); }
  }
};
export const toggleGet = async (el: Locator, options?: ActionOptions) =>
  el.isChecked({ timeout: options?.timeout });

export const fillSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {
  const t = options?.timeout;
  await el.fill(String(value), { timeout: t });
};
export const fillGet = async (el: Locator, options?: ActionOptions): Promise<string> =>
  el.inputValue({ timeout: options?.timeout });

// ── Stateless set/get helpers for inline handlers ───────────

/**
 * Set (check) a single radio button.  Use `radiogroupSet` to select
 * a radio by label text within a group.
 *
 * @throws {TypeError} if `value` is `false` — radio buttons cannot be
 * unchecked individually (only another radio in the group can be selected).
 */
const radioSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {
  if (value === false || value === "false") {
    throw new TypeError(
      "radioSet: cannot uncheck a radio button. Radio buttons can only be " +
        "selected, not deselected. To change the selection, check a different " +
        "radio in the group using radiogroupSet.",
    );
  }
  await el.check({ timeout: options?.timeout });
};
const radioGet = async (el: Locator, options?: ActionOptions) => {
  return el.isChecked({ timeout: options?.timeout });
};

const selectSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {
  await el.selectOption(String(value), { timeout: options?.timeout });
};
const selectGet = async (el: Locator, options?: ActionOptions) => {
  return readSelectedOptionText(el, options);
};

const comboboxSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {

  // P2-103: Auto-wait for the combobox to be attached before evaluate(),
  // which unlike click()/fill() does not auto-wait.
  await el.waitFor({ state: "attached", timeout: options?.timeout });

  // Detect whether the combobox element is editable (input/textarea) or
  // non-editable (div, button, span — typical of component library selects).
  // A readonly input (e.g. Shoelace sl-select) should be treated as non-editable.
  // Single evaluate() to avoid two round-trips (Issue #168).
  const { tagName, readOnly: isReadOnly } = await el.evaluate((node) => ({
    tagName: node.tagName.toLowerCase(),
    readOnly: (node as HTMLInputElement).readOnly === true,
  }));
  const isEditable = (tagName === "input" || tagName === "textarea") && !isReadOnly;

  // Some component libraries (e.g. Vuetify v-select) render an
  // <input role="combobox" inputmode="none"> that LOOKS like an editable
  // input but is NOT a typeahead / autocomplete.  Detect this and treat them
  // as non-editable to avoid fill() race conditions.
  const inputMode = isEditable
    ? await el.getAttribute("inputmode")
    : null;
  const isHybridInput = isEditable && inputMode === "none";

  if (!isEditable) {
    // Non-editable combobox (div, button, span) — delegate to adapter.
    await genericNonEditableSelectAdapter.select(el, String(value), options);
    return;
  }

  if (isHybridInput) {
    // Hybrid input combobox (e.g. Vuetify v-select): the <input> is overlaid
    // by a wrapper that intercepts pointer events.  Find a clickable
    // ancestor with role="combobox" and delegate to the non-editable adapter.
    // (Issue #129: removed Vuetify-specific .v-field class reference.)
    const clickTarget = el.locator("xpath=ancestor::*[@role='combobox'][1]");
    if ((await clickTarget.count()) > 0) {
      await genericNonEditableSelectAdapter.select(clickTarget.first(), String(value), options);
    } else {
      // No suitable ancestor — try the element itself with force open
      await genericNonEditableSelectAdapter.select(el, String(value), options);
    }
    return;
  }

  // Editable combobox — delegate to the editable adapter (Issue #119).
  await editableSelectAdapter.select(el, String(value), options);
};

/**
 * Read the current value of a combobox element.
 *
 * Editable comboboxes (`<input>`, `<textarea>`) use `inputValue()`.
 * Non-editable comboboxes (`<div>`, `<button>`, etc.) use the generic
 * non-editable adapter's `read()` which returns the trigger's textContent.
 * Hybrid inputs with `inputmode="none"` (e.g. Vuetify v-select) still use
 * `inputValue()` because textContent on `<input>` is always empty.
 */
const comboboxGet = async (el: Locator, options?: ActionOptions): Promise<string> => {
  // P2-103: Auto-wait for the combobox to be attached before evaluate(),
  // which unlike click()/fill() does not auto-wait.
  await el.waitFor({ state: "attached", timeout: options?.timeout });

  // Single evaluate() to avoid two round-trips (Issue #168).
  const { tagName, readOnly: isReadOnly, inputMode } = await el.evaluate((node) => ({
    tagName: node.tagName.toLowerCase(),
    readOnly: (node as HTMLInputElement).readOnly === true,
    inputMode: (node as HTMLInputElement).getAttribute?.("inputmode") ?? null,
  }));
  const isEditable = (tagName === "input" || tagName === "textarea") && !isReadOnly;

  if (!isEditable) {
    return genericNonEditableSelectAdapter.read(el, options);
  }

  // Hybrid input (inputmode="none") — e.g. Vuetify v-select: the <input>
  // value is empty; read from the non-editable ancestor instead (Issue #70).
  if (inputMode === "none") {
    const clickTarget = el.locator("xpath=ancestor::*[@role='combobox'][1]");
    if ((await clickTarget.count()) > 0) {
      return genericNonEditableSelectAdapter.read(clickTarget.first(), options);
    }
  }

  // For all editable <input>/<textarea> elements,
  // delegate to the editable adapter (Issue #119).
  return editableSelectAdapter.read(el, options);
};

const radiogroupSet = async (el: Locator, value: string | boolean, options?: ActionOptions) => {
  const t = options?.timeout;
  const label = String(value);

  // Try getByLabel first (native <label>+<input> associations)
  const byLabel = el.getByLabel(label);
  if ((await byLabel.count()) > 0) {
    await byLabel.check({ timeout: t, force: true });
    return;
  }

  // Fallback: ARIA radios (e.g. Shoelace sl-radio) where accessible name
  // comes from element text content, not a <label> association.
  // Use the same try-then-force pattern as toggleSet for shadow DOM
  // overlays where the real <input> is hidden behind a decorative span.
  const byRole = el.getByRole("radio", { name: label });
  if ((await byRole.count()) > 0) {
    try {
      await byRole.first().click({ timeout: t });
    } catch (e) {
      if (!isInterceptedError(e)) throw e;
      await byRole.first().click({ timeout: t, force: true });
    }
    return;
  }

  throw new ElementNotFoundError(
    `radiogroupSet: could not find radio option "${label}". ` +
    `Tried getByLabel("${label}") (0 matches), then getByRole("radio", { name: "${label}" }) (0 matches).`,
    { query: label, triedStrategies: ["getByLabel", "getByRole('radio')"], container: "radiogroup" },
  );
};
const radiogroupGet = async (el: Locator, options?: ActionOptions) => {
  // P2-170: readCheckedRadioLabel now returns null for "no selection"
  // and "" for "checked but unlabeled". Convert null to "" for backward
  // compatibility — callers can check for null via readCheckedRadioLabel directly.
  return (await readCheckedRadioLabel(el, options)) ?? "";
};

/**
 * Set the checked state of checkboxes within a checkbox group container.
 *
 * **String path (comma-separated):** When `value` is a `string`, it is
 * split on commas to derive the list of checkbox labels to check.
 * For example, `"Apple, Banana"` checks the boxes labeled "Apple" and
 * "Banana".  **Caveat:** labels that legitimately contain commas cannot
 * be selected via the string path.  Use the `string[]` overload instead
 * for such labels or when you want unambiguous semantics.
 *
 * **Array path (preferred):** When `value` is a `string[]`, each element
 * is used as-is — no splitting or transformation.  This is the
 * recommended form for programmatic use.
 *
 * All checkboxes whose normalized labels are **not** in the desired list
 * are unchecked, ensuring the group state matches `value` exactly.
 *
 * @param el      - The container locator (e.g. a `<fieldset>`).
 * @param value   - Desired checked labels: `string` (comma-separated),
 *                  `string[]` (explicit list), or `boolean` (ignored).
 * @param options - Action options (timeout, etc.).
 */
const checkboxgroupSet = async (el: Locator, value: string | boolean | string[], options?: ActionOptions) => {
  if (typeof value === "boolean") {
    throw new TypeError(
      `checkboxgroupSet: boolean values are not supported. ` +
      `Pass a comma-separated string or string[] of checkbox labels to check.`,
    );
  }
  const t = options?.timeout;
  const desired = Array.isArray(value)
    ? value.map((s) => s.trim()).filter(Boolean)
    : String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  // Support both native <input type="checkbox"> and ARIA role="checkbox"
  const checkboxes = el.locator('input[type="checkbox"], [role="checkbox"]');
  const count = await checkboxes.count();
  const matched = new Set<string>();
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const labelText = await resolveInputLabel(cb, el, options);
    const matchedLabel = desired.find(
      (d) => labelText.toLowerCase() === d.toLowerCase(),
    );
    const shouldCheck = matchedLabel !== undefined;
    if (shouldCheck) matched.add(matchedLabel.toLowerCase());
    // Use the same try-then-fallback pattern as toggleSet for shadow DOM
    // overlays (e.g. Shoelace sl-checkbox renders a <span> over the real <input>).
    const cbStart = Date.now();
    const firstAttemptTimeout = t ?? getTimeouts().toggleFirstAttemptMs;
    try {
      if (shouldCheck) { await cb.check({ timeout: firstAttemptTimeout }); } else { await cb.uncheck({ timeout: firstAttemptTimeout }); }
    } catch (e) {
      if (!isInterceptedError(e)) throw e;
      const remaining = t != null ? Math.max(0, t - (Date.now() - cbStart)) : undefined;
      if (shouldCheck) { await cb.check({ timeout: remaining, force: true }); } else { await cb.uncheck({ timeout: remaining, force: true }); }
    }
  }
  // Verify all desired labels were found in the group.
  const unmatched = desired.filter((d) => !matched.has(d.toLowerCase()));
  if (unmatched.length > 0) {
    throw new Error(
      `checkboxgroupSet: ${unmatched.length} desired label(s) not found in the checkbox group: ` +
        `${unmatched.map((l) => `"${l}"`).join(", ")}. ` +
        `Available labels: ${Array.from({ length: count }, (_, i) => i).length} checkbox(es) found.`,
    );
  }
};
const checkboxgroupGet = async (el: Locator, options?: ActionOptions) => {
  // Support both native checked and ARIA aria-checked.
  // Web component libraries (e.g. Shoelace) render both a hidden native
  // <input type="checkbox"> and a <div role="checkbox" aria-checked="true">
  // inside the same shadow host.  Query both selectors but deduplicate
  // by label text (case-insensitive) to avoid returning ["In Stock", "In Stock"].
  const nativeChecked = el.locator('input[type="checkbox"]:checked');
  const ariaChecked = el.locator('[role="checkbox"][aria-checked="true"], [role="checkbox"][aria-checked="mixed"]');
  const seen = new Set<string>();
  const labels: string[] = [];
  let dupCount = 0;
  const nativeCount = await nativeChecked.count();
  for (let i = 0; i < nativeCount; i++) {
    const label = await resolveInputLabel(nativeChecked.nth(i), el, options);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) { seen.add(key); labels.push(label); } else if (label) { dupCount++; }
  }
  const ariaCount = await ariaChecked.count();
  for (let i = 0; i < ariaCount; i++) {
    const label = await resolveInputLabel(ariaChecked.nth(i), el, options);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) { seen.add(key); labels.push(label); } else if (label) { dupCount++; }
  }
  if (dupCount > 0) {
    const msg =
      `[framework] checkboxgroupGet: deduplicated ${dupCount} checkbox(es) with duplicate labels. ` +
      `If this is unexpected (not a shadow DOM artifact), your checkbox group may have ` +
      `identically-labeled checkboxes that cannot be distinguished by label text.`;
    try {
      getActiveContext().logger.getLogger().warn(msg);
    } catch {
      console.warn(msg);
    }
  }
  return labels;
};

const clickSet = async (el: Locator, _value: string | boolean, options?: ActionOptions) => {
  await el.click({ timeout: options?.timeout });
};
const textContentGet = async (el: Locator, options?: ActionOptions) => {
  return ((await el.textContent({ timeout: options?.timeout })) ?? "").trim();
};

// ── Default handler definitions ─────────────────────────────

/**
 * Module-level constant array of built-in handlers.
 *
 * The handler objects and their set/get functions are stateless, so they
 * can be safely shared across contexts.  {@link createDefaultHandlers}
 * returns a shallow clone so callers can mutate the array without
 * affecting the canonical list.
 */
const DEFAULT_HANDLERS: readonly Readonly<ElementHandler>[] = [
  /* ── Native <input> subtypes ─────────────────────────────── */
  {
    type: "checkbox",
    detect: [
      { tags: ["input"], inputTypes: ["checkbox"] },
      { roles: ["checkbox"] },
    ],
    expectedValueType: ["boolean", "string"],
    valueKind: "boolean",
    set: toggleSet,
    get: toggleGet,
  },
  {
    type: "radio",
    detect: [
      { tags: ["input"], inputTypes: ["radio"] },
      { roles: ["radio"] },
    ],
    expectedValueType: ["boolean"],
    valueKind: "boolean",
    set: radioSet,
    get: radioGet,
  },
  {
    type: "slider",
    detect: [
      { tags: ["input"], inputTypes: ["range"] },
      { roles: ["slider"] },
    ],
    expectedValueType: ["string"],
    valueKind: "string",
    set: async (el: Locator, value: string | boolean, options?: ActionOptions) => {
      await el.fill(String(value), { timeout: options?.timeout });
    },
    get: fillGet,
  },

  /* ── Native tags ─────────────────────────────────────────── */
  {
    type: "select",
    detect: [
      { tags: ["select"] },
      { roles: ["listbox"] },
      // Shoelace / web component custom element tag names.
      // Matched directly by tag so the classifier doesn't rely on
      // requireChild probing, which fails for deeply nested shadow
      // DOMs (Issue 116, P1-18).
      { tags: ["sl-select"] },
    ],
    expectedValueType: ["string"],
    valueKind: "string",
    set: selectSet,
    get: selectGet,
  },
  {
    type: "textarea",
    detect: [{ tags: ["textarea"] }],
    expectedValueType: ["string"],
    valueKind: "string",
    set: fillSet,
    get: fillGet,
  },

  /* ── ARIA widget roles ───────────────────────────────────── */
  {
    type: "switch",
    detect: [{ roles: ["switch"] }],
    expectedValueType: ["boolean", "string"],
    valueKind: "boolean",
    set: toggleSet,
    get: toggleGet,
  },
  {
    type: "combobox",
    detect: [{ roles: ["combobox"] }],
    expectedValueType: ["string"],
    valueKind: "string",
    set: comboboxSet,
    get: comboboxGet,
  },

  /* ── Groups (fieldset / role-based containers) ───────────── */
  {
    type: "radiogroup",
    detect: [
      { roles: ["radiogroup"] },
      { tags: ["fieldset"], requireChild: 'input[type="radio"], [role="radio"]' },
      { roles: ["group"], requireChild: 'input[type="radio"], [role="radio"]' },
    ],
    expectedValueType: ["string"],
    valueKind: "string",
    set: radiogroupSet,
    get: radiogroupGet,
  },
  {
    type: "checkboxgroup",
    detect: [
      { tags: ["fieldset"], requireChild: 'input[type="checkbox"], [role="checkbox"]' },
      { roles: ["group"], requireChild: 'input[type="checkbox"], [role="checkbox"]' },
    ],
    expectedValueType: ["string", "string[]"],
    valueKind: "string[]",
    set: checkboxgroupSet,
    get: checkboxgroupGet,
  },

  /* ── Button (non-input interactive element) ─────────────── */
  {
    type: "button",
    detect: [{ tags: ["button"] }, { roles: ["button"] }],
    expectedValueType: ["string"],
    valueKind: "string",
    set: clickSet,
    get: textContentGet,
  },

  /* ── Link ────────────────────────────────────────────────── */
  {
    type: "link",
    detect: [{ tags: ["a"] }, { roles: ["link"] }],
    expectedValueType: ["string"],
    valueKind: "string",
    set: clickSet,
    get: textContentGet,
  },

  /* ── Read-only text display (for label strategies) ─────── */
  {
    type: "text-display",
    detect: [
      { tags: ["span"] },
      { tags: ["p"] },
      { tags: ["div"] },
      { tags: ["output"] },
      { tags: ["dd"] },
      { tags: ["td"] },
      { tags: ["li"] },
      { tags: ["time"] },
    ],
    expectedValueType: ["string"],
    valueKind: "string",
    set: async () => {
      throw new Error(
        "text-display handler: this element is read-only. " +
        "Use group.read() to read its value.",
      );
    },
    get: textContentGet,
  },

  /* ── Generic input (fallback) ────────────────────────────── */
  {
    type: "input",
    detect: [
      { roles: ["textbox"] },
      { roles: ["spinbutton"] },
      { roles: ["searchbox"] },
      { attr: ["contenteditable", "true"] },
      { tags: ["input"] },
    ],
    expectedValueType: ["string"],
    valueKind: "string",
    set: fillSet,
    get: fillGet,
  },
];

// Deep-freeze every handler object (and its nested detect rules)
// at module load so shared references can never be mutated.
for (const h of DEFAULT_HANDLERS) {
  for (const rule of h.detect) Object.freeze(rule);
  Object.freeze(h.detect);
  if (h.expectedValueType) Object.freeze(h.expectedValueType);
  Object.freeze(h);
}

/**
 * Create a fresh copy of the built-in handler array.
 * Called once per FrameworkContext construction.
 *
 * Returns a shallow clone of the module-level constant array.
 * The individual handler objects are frozen at module load, so
 * callers can mutate the array (splice/push) but cannot corrupt
 * the canonical handler definitions.
 */
export function createDefaultHandlers(): ElementHandler[] {
  return [...DEFAULT_HANDLERS];
}

// ── Handler composition / delegation ────────────────────────

/**
 * Look up a built-in handler by its `type` name from the default set.
 *
 * This always returns a handler from the *pristine* default list, so the
 * result is independent of any runtime registrations or mutations.
 *
 * @throws if no built-in handler matches the requested type.
 */
export function getDefaultHandlerByType(type: string): ElementHandler {
  const defaults = createDefaultHandlers();
  const handler = defaults.find(h => h.type === type);
  if (!handler) {
    throw new Error(
      `getDefaultHandlerByType: no built-in handler with type "${type}". ` +
      `Available types: ${defaults.map(h => h.type).join(", ")}.`,
    );
  }
  return handler;
}

/**
 * Configuration accepted by {@link createHandler}.
 *
 * Every field of {@link ElementHandler} can be overridden.  The `extends`
 * property names the built-in handler whose behaviour you want to inherit.
 */
export type CreateHandlerConfig = Partial<ElementHandler> & {
  /** The `type` name of the built-in handler to extend. */
  extends: string;
  /**
   * New unique type name for the derived handler.
   * Required so it doesn't collide with the base handler in the registry.
   */
  type: string;
};

/**
 * Create a new handler that inherits behaviour from a built-in handler.
 *
 * Only the fields you provide in `config` are overridden — everything
 * else (including `set`, `get`, `detect`, `expectedValueType`, etc.)
 * falls through to the base handler.
 *
 * @example
 * ```ts
 * const myCombobox = createHandler({
 *   extends: "combobox",
 *   type: "custom-combobox",
 *   detect: [{ roles: ["combobox"], attr: ["data-custom", "true"] }],
 *   async set(el, value, options) {
 *     // custom pre-processing
 *     await getDefaultHandlerByType("combobox").set(el, value, options);
 *     // custom post-processing
 *   },
 * });
 * registerHandler(myCombobox);
 * ```
 */
export function createHandler(config: CreateHandlerConfig): ElementHandler {
  const { extends: baseType, ...overrides } = config;
  const base = getDefaultHandlerByType(baseType);
  const handler: ElementHandler = {
    ...base,
    ...overrides,
    // Deep-clone detect rules to break shared references with the pristine
    // default handler — prevents accidental mutation corruption.
    // Nested arrays (tags, roles, etc.) must be spread individually;
    // a shallow { ...r } still shares them by reference.
    detect: (overrides.detect ?? base.detect).map(r => ({
      ...r,
      tags: r.tags ? [...r.tags] : undefined,
      roles: r.roles ? [...r.roles] : undefined,
      inputTypes: r.inputTypes ? [...r.inputTypes] : undefined,
      ...(r.attr ? { attr: [...r.attr] as [string, string] } : {}),
    } as DetectRule)),
  };

  // Freeze the handler (and its detect rules) to match the depth
  // applied by registerHandler() — prevents accidental mutation
  // when the handler is used directly without registration.
  for (const rule of handler.detect) Object.freeze(rule);
  Object.freeze(handler.detect);
  Object.freeze(handler);

  return handler;
}
