/** Label resolution and normalisation helpers for form controls. */
import type { Locator } from "@playwright/test";
import type { ActionOptions, ElementHandler } from "./handler-types.js";
import { ElementNotFoundError } from "./errors.js";
import type { IFrameworkContext } from "./types.js";
import { retryUntil, type RetryResult } from "./retry.js";
import { isDetachedError } from "./playwright-errors.js";
import { cssEscape } from "./dom-helpers.js";

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
 * @param raw   The raw label text to normalize.
 * @returns     The normalized label — either the full trimmed text or
 *              the portion before the first em/en dash separator.
 */
export function normalizeRadioLabel(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+?)\s*[—–]\s/);
  return match ? match[1].trim() : trimmed;
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
    const forLabel = container.locator(`label[for="${cssEscape(id)}"]`);
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

  return "";
}

/** Read the label text of the currently checked radio within a container. */
export async function readCheckedRadioLabel(container: Locator, options?: ActionOptions): Promise<string> {
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
  return "";
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
  const result = await resolveOnce(container, label, fwCtx);

  if (!result) {
    const roles = fwCtx.handlers.getRoleFallbacks();
    return {
      kind: "retry",
      error: new ElementNotFoundError(
        `No element found with label "${label}" in container. ` +
        `Tried: getByLabel, then getByRole for [${roles.join(", ")}].`,
        {
          query: label,
          triedStrategies: ["getByLabel", ...roles.map(r => `getByRole("${r}")`)],
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
    // Everything else (NoHandlerMatchError, TypeError, etc.) is fatal.
    return { kind: "fail", error: err };
  }
}

/**
 * Resolve a labeled element and its handler within a container.
 *
 * Resolution chain:
 * 1. getByLabel — standard form controls associated via <label>.
 * 2. getByRole(role, { name }) for each role derived from the handler
 *    registry — catches <fieldset>/<legend>, ARIA widgets, etc.
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
    throw new ElementNotFoundError(
      `No element found with label "${label}" in container after waiting ${effectiveTimeout}ms. ` +
      `Tried: getByLabel, then getByRole for [${roles.join(", ")}].`,
      {
        query: label,
        triedStrategies: ["getByLabel", ...roles.map(r => `getByRole("${r}")`)],
        container: "group",
      },
      { cause: err },
    );
  }
}

/**
 * Single-pass resolution attempt. Returns the matched locator or null
 * if nothing was found. Does NOT call detectHandler — the caller
 * wraps that in retry logic.
 *
 * All candidate locators (getByLabel + every role fallback) are counted
 * in a single parallel `Promise.all` batch so the resolution costs one
 * wall-clock round-trip regardless of how many roles exist.
 */
async function resolveOnce(
  container: Locator,
  label: string,
  fwCtx: IFrameworkContext,
): Promise<{ el: Locator } | null> {
  const logger = fwCtx.logger.getLogger();
  const roles = fwCtx.handlers.getRoleFallbacks();

  logger.debug(
    `[resolveOnce] Resolving label "${label}" — trying getByLabel, then roles [${roles.join(", ")}].`,
  );

  // Build all candidate locators: label-association first, then each
  // role in priority order.
  const byLabel = container.getByLabel(label);
  const roleLocators = roles.map(role =>
    container.getByRole(role, { name: label }),
  );

  // Fire every count() in a single parallel batch — one wall-clock
  // round-trip instead of O(N) sequential ones.
  const [labelCount, ...roleCounts] = await Promise.all([
    byLabel.count(),
    ...roleLocators.map(loc => loc.count()),
  ]);

  // Phase 1: standard <label> association
  if (labelCount > 0) {
    if (labelCount > 1) {
      logger.warn(
        `[group] Ambiguous label "${label}": ${labelCount} elements matched via getByLabel. Using first match.`,
      );
    }
    logger.debug(
      `[resolveOnce] Matched label "${label}" via getByLabel (count=${labelCount}).`,
    );
    // Always use .first() for consistent locator string representations
    // in error messages, regardless of whether count is 1 or >1.
    return { el: byLabel.first() };
  }

  // Phase 2: role-based fallback — return the first match in priority order
  for (let i = 0; i < roles.length; i++) {
    if (roleCounts[i] > 0) {
      if (roleCounts[i] > 1) {
        logger.warn(
          `[group] Ambiguous label "${label}": ${roleCounts[i]} elements matched via getByRole("${roles[i]}"). Using first match.`,
        );
      }
      logger.debug(
        `[resolveOnce] Matched label "${label}" via getByRole("${roles[i]}") (count=${roleCounts[i]}).`,
      );
      // Always use .first() for consistent locator descriptions.
      return { el: roleLocators[i].first() };
    }
  }

  logger.debug(
    `[resolveOnce] No match for label "${label}" — all strategies returned 0 hits.`,
  );
  return null;
}
