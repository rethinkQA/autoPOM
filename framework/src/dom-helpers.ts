/** DOM utility helpers shared across element wrappers and handlers. */
import type { Locator } from "@playwright/test";
import type { ActionOptions } from "./handler-types.js";

/**
 * Node-safe CSS identifier escaping.
 *
 * Delegates to the global `CSS.escape()` when available (browser context,
 * newer Node versions) and falls back to a spec-compliant polyfill when
 * running in Node environments that lack the `CSS` global.
 *
 * Uses the CSSOM `CSS.escape()` algorithm from
 * https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export function cssEscape(value: string): string {
  if (typeof globalThis.CSS?.escape === "function") {
    return globalThis.CSS.escape(value);
  }

  // Minimal polyfill — handles the common cases for DOM IDs.
  // Full spec: https://drafts.csswg.org/cssom/#serialize-an-identifier
  const str = String(value);
  const codePoints = [...str]; // iterate by code point, not code unit
  const length = codePoints.length;
  let result = "";

  for (let i = 0; i < length; i++) {
    const cp = codePoints[i].codePointAt(0)!;

    // Null byte
    if (cp === 0x0000) {
      result += "\uFFFD";
      continue;
    }

    if (
      // Control characters (U+0001–U+001F, U+007F)
      (cp >= 0x0001 && cp <= 0x001f) ||
      cp === 0x007f
    ) {
      result += "\\" + cp.toString(16) + " ";
      continue;
    }

    if (i === 0) {
      // Digit as first char
      if (cp >= 0x0030 && cp <= 0x0039) {
        result += "\\" + cp.toString(16) + " ";
        continue;
      }
      // Hyphen-minus as first char followed by nothing or another hyphen
      if (cp === 0x002d && length === 1) {
        result += "\\" + codePoints[i];
        continue;
      }
      // P3-100: Hyphen followed by a digit as the second char
      if (cp === 0x002d && length > 1) {
        const nextCp = codePoints[1].codePointAt(0)!;
        if (nextCp >= 0x0030 && nextCp <= 0x0039) {
          result += "\\" + cp.toString(16) + " ";
          continue;
        }
      }
    }

    // Characters outside BMP — always safe to include as-is
    if (cp >= 0x0080) {
      result += codePoints[i];
      continue;
    }

    // ASCII characters that need escaping
    if (
      cp !== 0x002d && // -
      cp !== 0x005f && // _
      !(cp >= 0x0030 && cp <= 0x0039) && // 0-9
      !(cp >= 0x0041 && cp <= 0x005a) && // A-Z
      !(cp >= 0x0061 && cp <= 0x007a) // a-z
    ) {
      result += "\\" + codePoints[i];
      continue;
    }

    result += codePoints[i];
  }

  return result;
}

/**
 * Read the visible text of the currently selected `<option>`.
 * Uses the `:checked` pseudo-class, falling back to inputValue().
 */
export async function readSelectedOptionText(el: Locator, options?: ActionOptions): Promise<string> {
  const t = options?.timeout;
  const selected = el.locator("option:checked");
  const count = await selected.count();
  if (count > 0) {
    return ((await selected.first().textContent({ timeout: t })) ?? "").trim();
  }
  return (await el.inputValue({ timeout: t })).trim();
}

/**
 * Click a button, link, or other clickable element within a container by text.
 *
 * Role cascade: button → link → menuitem → tab → menuitemcheckbox →
 * menuitemradio → option → getByText() fallback.
 *
 * The cascade covers component library widget roles (menus, tabs,
 * option lists) in addition to native buttons and links.
 *
 * All role `count()` calls are batched in a single `Promise.all` to
 * minimise wall-clock latency (#134).
 */
export async function clickInContainer(
  container: Locator,
  text: string,
  options?: ActionOptions & { roles?: readonly string[] },
): Promise<void> {
  if (!text.trim()) {
    throw new Error("clickInContainer: text must be a non-empty string");
  }
  const t = options?.timeout;

  // All roles in priority order.
  const roles = options?.roles ?? [
    "button",
    "link",
    "menuitem",
    "tab",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
  ] as const;

  // Build locators for every role and count them in parallel.
  //
  // NOTE: Known TOCTOU race — between the count() check and the subsequent
  // click(), the DOM can mutate (e.g. animations, portaled elements).  In
  // practice, Playwright's built-in auto-retry/waiting on click() handles
  // most cases.  Using locator.click() directly would avoid the race but
  // would lose the prioritised role cascade.
  const roleLocators = roles.map(role =>
    container.getByRole(role, { name: text }),
  );
  const counts = await Promise.all(roleLocators.map(loc => loc.count()));

  // Click the first role that has a match.
  for (let i = 0; i < roles.length; i++) {
    if (counts[i] > 0) {
      await roleLocators[i].first().click({ timeout: t });
      return;
    }
  }

  // Fallback: match by text content.
  await container.getByText(text).first().click({ timeout: t });
}
