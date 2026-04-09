/** Label resolution and normalisation helpers for form controls. */
import type { Locator } from "@playwright/test";
import type { ActionOptions, ElementHandler } from "./handler-types.js";
import { AmbiguousMatchError, ElementNotFoundError } from "./errors.js";
import type { IFrameworkContext } from "./types.js";
import { retryUntil, type RetryResult } from "./retry.js";
import { isDetachedError } from "./playwright-errors.js";
import { cssEscape } from "./dom-helpers.js";
import { getActiveContext } from "./context.js";

/**
 * Normalize a radio/checkbox label by extracting just the option name.
 *
 * **Dash-stripping behavior:** Labels containing an em dash (U+2014 —)
 * or en dash (U+2013 –) followed by a space are truncated to the text
 * before the dash.  This is common for shipping/pricing options:
 *
 * - `"Express — $9.99"` → `"Express"`
 * - `"Overnight – $19.99"` → `"Overnight"`
 *
 * Regular hyphens (U+002D `-`) are intentionally *not* stripped to
 * avoid false positives on hyphenated labels like `"Pre-paid"` or
 * `"T-shirt"`.
 *
 * **Important:** If your application uses em/en dashes as meaningful
 * content within labels (not as separators), this function will
 * truncate them.  In such cases, use `aria-label` on the input element
 * to provide a clean label that bypasses normalization, or match on the
 * truncated prefix.
 *
 * P2-220: Uses **greedy** match `(.+)` to keep everything before the
 * *last* em/en dash, preserving multi-segment content like
 * `"Standard — 5-7 days — $4.99"` → `"Standard — 5-7 days"`.
 *
 * @param raw   The raw label text to normalize.
 * @returns     The normalized label — either the full trimmed text or
 *              the portion before the last em/en dash separator.
 */
export function normalizeRadioLabel(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+)\s*[—–]\s/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Normalize a label string for the fuzzy resolution pass (Phases 3–5).
 *
 * Applied transformations:
 * 1. Trim leading/trailing whitespace.
 * 2. Collapse runs of internal whitespace to a single space.
 * 3. Strip a trailing colon (with optional preceding whitespace).
 *
 * Returns null when normalization produces no change (the exact pass
 * already tried this value, so retrying would be redundant).
 *
 * @param raw The raw label text to normalize.
 * @returns   The normalized label, or `null` if it equals the input.
 */
export function normalizeLabel(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*$/, "");
  return normalized === raw ? null : normalized;
}

/**
 * Build a regex that matches a label with tolerance for common DOM
 * messiness. Used by the normalized resolution phases (3–5).
 *
 * Tolerance:
 * - Leading/trailing whitespace in the DOM label.
 * - Runs of whitespace collapsed (user types one space, DOM has many).
 * - Optional trailing colon (`:`) with surrounding whitespace.
 *
 * @param label  The user-supplied label text.
 * @returns      A regex anchored with `^…$` for exact-with-tolerance matching.
 */
export function buildNormalizedPattern(label: string): RegExp {
  const cleaned = label
    .trim()
    .replace(/\s*:\s*$/, "")
    .replace(/\s+/g, " ");
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexWhitespace = escaped.replace(/ /g, "\\s+");
  return new RegExp(`^\\s*${flexWhitespace}\\s*:?\\s*$`);
}

/**
 * Resolve the visible label text for any input element within a container.
 * Used by radio, checkbox-group, and handlers that need a normalised label.
 */
export async function resolveInputLabel(
  input: Locator,
  container: Locator,
  options?: ActionOptions,
): Promise<string> {
  const t = options?.timeout;

  const ariaLabel = await input.getAttribute("aria-label", { timeout: t });
  if (ariaLabel) return normalizeRadioLabel(ariaLabel);

  const id = await input.getAttribute("id", { timeout: t });
  if (id) {
    const forLabel = container.locator(`label[for="${cssEscape(id).replace(/"/g, '\\"')}"]`);
    if ((await forLabel.count()) > 0) {
      const text = (await forLabel.textContent({ timeout: t })) ?? "";
      return normalizeRadioLabel(text);
    }
  }

  const wrappingLabel = input.locator("xpath=ancestor::label");
  if ((await wrappingLabel.count()) > 0) {
    const text = (await wrappingLabel.first().textContent({ timeout: t })) ?? "";
    return normalizeRadioLabel(text);
  }

  // Fallback: for ARIA role="radio"/"checkbox" elements (e.g. Shoelace),
  // the accessible name comes from the element's own text content.
  const text = (await input.textContent({ timeout: t })) ?? "";
  if (text.trim()) {
    return normalizeRadioLabel(text);
  }

  // All label strategies failed — emit a warning so the root cause of
  // downstream "element not found" errors is visible.
  const tag = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => "unknown");
  const msg =
    `[framework] resolveInputLabel: Element <${tag}> has no resolvable label ` +
    `(tried: aria-label, label[for], wrapping <label>, text content). ` +
    `Add an aria-label or associated <label> to make it identifiable.`;
  try {
    getActiveContext().logger.getLogger().warn(msg);
  } catch {
    console.warn(msg);
  }

  return "";
}

/** Read the label text of the currently checked radio within a container.
 *
 * P2-170: Returns `null` when no radio is selected (no checked input found),
 * and `""` when a checked radio has no resolvable label. This eliminates
 * the ambiguous empty-string sentinel.
 */
export async function readCheckedRadioLabel(container: Locator, options?: ActionOptions): Promise<string | null> {
  // Try native radio inputs first
  const nativeChecked = container.locator("input[type='radio']:checked");
  if ((await nativeChecked.count()) > 0) {
    return resolveInputLabel(nativeChecked.first(), container, options);
  }
  // Fallback: ARIA role="radio" elements (e.g. Bits UI, Radix)
  const ariaChecked = container.locator('[role="radio"][aria-checked="true"]');
  if ((await ariaChecked.count()) > 0) {
    return resolveInputLabel(ariaChecked.first(), container, options);
  }
  // P2-170: Return null for "no radio selected" (distinct from "" = unlabeled checked)
  return null;
}

// ── Discriminated-union result for a single resolution attempt ───────

/** Outcome of a single resolution attempt — replaces exception-based control flow. */
type ResolveAttemptResult =
  | { kind: "ok"; el: Locator; handler: ElementHandler }
  | { kind: "retry"; error: Error }
  | { kind: "fail"; error: unknown };

/**
 * Single attempt at resolving a labeled element **and** detecting its
 * handler. Returns a discriminated union so callers can decide how to
 * handle each outcome without nested try/catch.
 *
 * Outcomes:
 *  - `ok`    — element found and handler matched.
 *  - `retry` — transient failure (element not found, or stale/detached
 *              element race); the caller should retry.
 *  - `fail`  — non-transient error from `detectHandler` (e.g.
 *              `NoHandlerMatchError`, `TypeError` in handler code);
 *              retrying will not help.
 */
async function resolveAttempt(
  container: Locator,
  label: string,
  fwCtx: IFrameworkContext,
): Promise<ResolveAttemptResult> {
  let result: { el: Locator } | null;
  try {
    result = await resolveOnce(container, label, fwCtx);
  } catch (err: unknown) {
    // AmbiguousMatchError (and any other non-transient) — surface immediately.
    return { kind: "fail", error: err };
  }

  if (!result) {
    const roles = fwCtx.handlers.getRoleFallbacks();
    const strategyNames = fwCtx.handlers.labelStrategies.map(s => s.name);
    const triedStrategies = [
      "getByLabel(exact)",
      "getByPlaceholder(exact)",
      ...strategyNames.map(n => `labelStrategy("${n}")`),
      "getByLabel(normalized)",
      "getByPlaceholder(normalized)",
      ...roles.map(r => `getByRole("${r}", normalized)`),
    ];
    return {
      kind: "retry",
      error: new ElementNotFoundError(
        `No element found with label "${label}" in container. ` +
        `Tried: ${triedStrategies.join(", ")}.`,
        {
          query: label,
          triedStrategies,
          container: "group",
        },
      ),
    };
  }

  try {
    const handler = await fwCtx.handlers.detectHandler(result.el);
    return { kind: "ok", el: result.el, handler };
  } catch (err: unknown) {
    // Stale/detached element errors indicate a race between count()
    // finding the element and detectHandler() inspecting it — retryable.
    if (isDetachedError(err)) {
      return { kind: "retry", error: err instanceof Error ? err : new Error(String(err)) };
    }
    // P3-236: Attach resolution strategy context to handler detection errors
    // so that debugging reveals *how* the element was found, not just that
    // handler detection failed.
    if (err instanceof Error) {
      err.message = `${err.message} (element was resolved via label "${label}")`;
    }
    // Everything else (NoHandlerMatchError, TypeError, etc.) is fatal.
    return { kind: "fail", error: err };
  }
}

/**
 * Resolve a labeled element and its handler within a container.
 *
 * Resolution chain (6 phases):
 * 0. getByLabel (exact) — standard form controls associated via <label>.
 * 1. getByPlaceholder (exact) — inputs with no <label>, only placeholder.
 * 2. Registered label strategies — custom user-defined resolution.
 * 3. getByLabel (normalized, exact) — trim/collapse/strip colon, retry.
 * 4. getByPlaceholder (normalized, exact) — same normalization.
 * 5. getByRole (normalized, exact) — fieldset/legend, ARIA widgets.
 *
 * Uses a standalone `retryUntil()` loop for automatic retries with a
 * progressive back-off schedule, so the framework has no runtime
 * dependency on the Playwright test runner. The timeout respects the
 * caller's per-action timeout, falling back to the configured
 * `resolveRetry.resolveTimeoutMs`.
 */
export async function resolveLabeled(
  container: Locator,
  label: string,
  fwCtx: IFrameworkContext,
  timeout?: number,
): Promise<{ el: Locator; handler: ElementHandler }> {
  if (!label.trim()) {
    throw new Error("resolveLabeled: label must be a non-empty string");
  }

  const effectiveTimeout = timeout ?? fwCtx.resolveRetry.resolveTimeoutMs;

  try {
    return await retryUntil(async (): Promise<RetryResult<{ el: Locator; handler: ElementHandler }>> => {
      const attempt = await resolveAttempt(container, label, fwCtx);

      switch (attempt.kind) {
        case "ok":
          return { ok: true, value: { el: attempt.el, handler: attempt.handler } };
        case "fail":
          // Non-transient — stop retrying immediately.
          return { ok: false, retryable: false, error: attempt.error };
        case "retry":
          // Transient — let retryUntil schedule another attempt.
          return { ok: false, retryable: true, error: attempt.error };
      }
    }, {
      timeout: effectiveTimeout,
      intervals: fwCtx.resolveRetry.resolveRetryIntervals,
    });
  } catch (err) {
    // Non-retryable errors (e.g. NoHandlerMatchError) are unwrapped by
    // retryUntil and arrive here as the original error — just re-throw.
    if (!(err instanceof ElementNotFoundError)) throw err;

    // Retry budget exhausted — the element was never found.
    const roles = fwCtx.handlers.getRoleFallbacks();
    const strategyNames = fwCtx.handlers.labelStrategies.map(s => s.name);
    const triedStrategies = [
      "getByLabel(exact)",
      "getByPlaceholder(exact)",
      ...strategyNames.map(n => `labelStrategy("${n}")`),
      "getByLabel(normalized)",
      "getByPlaceholder(normalized)",
      ...roles.map(r => `getByRole("${r}", normalized)`),
    ];
    throw new ElementNotFoundError(
      `No element found with label "${label}" in container after waiting ${effectiveTimeout}ms. ` +
      `Tried: ${triedStrategies.join(", ")}.`,
      {
        query: label,
        triedStrategies,
        container: "group",
      },
      { cause: err },
    );
  }
}

/**
 * Helper — count a locator and return the match with ambiguity checking.
 * Returns the first element if exactly one match, throws on ambiguity,
 * returns null on zero matches.
 */
async function tryLocator(
  loc: Locator,
  label: string,
  strategy: string,
  logger: ReturnType<IFrameworkContext["logger"]["getLogger"]>,
): Promise<{ el: Locator } | null> {
  const count = await loc.count();
  if (count === 0) return null;
  if (count > 1) {
    const msg = `Ambiguous label "${label}": ${count} elements matched via ${strategy}.`;
    logger.warn(`[group] ${msg} Rejecting ambiguous match.`);
    throw new AmbiguousMatchError(
      `${msg} Disambiguate by narrowing the container scope or using a more specific label.`,
      { query: label, matchCount: count, strategy },
    );
  }
  logger.debug(`[resolveOnce] Matched label "${label}" via ${strategy} (count=1).`);
  return { el: loc.first() };
}

/**
 * Single-pass resolution attempt. Returns the matched locator or null
 * if nothing was found. Does NOT call detectHandler — the caller
 * wraps that in retry logic.
 *
 * Resolution chain (6 phases):
 *
 * | Phase | Strategy                | Match type        |
 * |-------|-------------------------|-------------------|
 * | 0     | getByLabel              | exact             |
 * | 1     | getByPlaceholder        | exact             |
 * | 2     | Registered strategies   | custom            |
 * | 3     | getByLabel              | normalized, exact |
 * | 4     | getByPlaceholder        | normalized, exact |
 * | 5     | getByRole (fallbacks)   | normalized, exact |
 *
 * Phases 0–2 use the raw label. Phases 3–5 use a regex pattern that
 * tolerates leading/trailing whitespace, collapsed internal whitespace,
 * and an optional trailing colon in the DOM label text.
 */
async function resolveOnce(
  container: Locator,
  label: string,
  fwCtx: IFrameworkContext,
): Promise<{ el: Locator } | null> {
  const logger = fwCtx.logger.getLogger();
  const roles = fwCtx.handlers.getRoleFallbacks();

  logger.debug(
    `[resolveOnce] Resolving label "${label}" — 6-phase chain: ` +
    `getByLabel(exact), getByPlaceholder(exact), strategies, ` +
    `getByLabel(normalized), getByPlaceholder(normalized), roles(normalized) ` +
    `[${roles.join(", ")}].`,
  );

  // ── Phase 0: getByLabel (exact) ─────────────────────────────────
  // Exact matching avoids substring ambiguity — e.g. "Category" must
  // not match "Sort by Category".
  const hit0 = await tryLocator(
    container.getByLabel(label, { exact: true }),
    label, "getByLabel(exact)", logger,
  );
  if (hit0) return hit0;

  // ── Phase 1: getByPlaceholder (exact) ───────────────────────────
  // Catches inputs without associated <label> (e.g. password fields).
  const hit1 = await tryLocator(
    container.getByPlaceholder(label, { exact: true }),
    label, "getByPlaceholder(exact)", logger,
  );
  if (hit1) return hit1;

  // ── Phase 2: registered label strategies ────────────────────────
  const strategies = fwCtx.handlers.labelStrategies;
  for (const strategy of strategies) {
    logger.debug(
      `[resolveOnce] Trying label strategy "${strategy.name}" for label "${label}".`,
    );
    const result = await strategy.resolve(container, label);
    if (result) {
      logger.debug(
        `[resolveOnce] Matched label "${label}" via label strategy "${strategy.name}".`,
      );
      return { el: result };
    }
  }

  // ── Normalized pass (Phases 3–5) ────────────────────────────────
  // Build a regex that tolerates whitespace / trailing-colon drift
  // between the user's query and what appears in the DOM.  The pattern
  // uses anchors (^ $) so it behaves like exact matching, just with
  // tolerance for leading/trailing whitespace, collapsed internal
  // whitespace, and an optional trailing colon.
  const pattern = buildNormalizedPattern(label);
  logger.debug(
    `[resolveOnce] Normalized pattern: ${pattern}. Running normalized pass.`,
  );

  // ── Phase 3: getByLabel (normalized) ────────────────────────────
  const hit3 = await tryLocator(
    container.getByLabel(pattern),
    label, `getByLabel(normalized)`, logger,
  );
  if (hit3) return hit3;

  // ── Phase 4: getByPlaceholder (normalized) ──────────────────────
  const hit4 = await tryLocator(
    container.getByPlaceholder(pattern),
    label, `getByPlaceholder(normalized)`, logger,
  );
  if (hit4) return hit4;

  // ── Phase 5: getByRole fallbacks (normalized) ───────────────────
  for (const role of roles) {
    const hit5 = await tryLocator(
      container.getByRole(role, { name: pattern }),
      label, `getByRole("${role}", normalized)`, logger,
    );
    if (hit5) return hit5;
  }

  logger.debug(
    `[resolveOnce] No match for label "${label}" — all strategies returned 0 hits.`,
  );
  return null;
}
