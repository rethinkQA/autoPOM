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
  const length = str.length;
  let result = "";

  for (let i = 0; i < length; i++) {
    const ch = str.charCodeAt(i);

    // Null byte
    if (ch === 0x0000) {
      result += "\uFFFD";
      continue;
    }

    if (
      // Control characters (U+0001–U+001F, U+007F)
      (ch >= 0x0001 && ch <= 0x001f) ||
      ch === 0x007f
    ) {
      result += "\\" + ch.toString(16) + " ";
      continue;
    }

    if (i === 0) {
      // Digit as first char
      if (ch >= 0x0030 && ch <= 0x0039) {
        result += "\\" + ch.toString(16) + " ";
        continue;
      }
      // Hyphen-minus as first char followed by nothing or another hyphen
      if (ch === 0x002d && length === 1) {
        result += "\\" + str.charAt(i);
        continue;
      }
    }

    // Characters that need escaping
    if (
      ch < 0x0080 &&
      ch !== 0x002d && // -
      ch !== 0x005f && // _
      !(ch >= 0x0030 && ch <= 0x0039) && // 0-9
      !(ch >= 0x0041 && ch <= 0x005a) && // A-Z
      !(ch >= 0x0061 && ch <= 0x007a) // a-z
    ) {
      result += "\\" + str.charAt(i);
      continue;
    }

    result += str.charAt(i);
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
  options?: ActionOptions,
): Promise<void> {
  if (!text.trim()) {
    throw new Error("clickInContainer: text must be a non-empty string");
  }
  const t = options?.timeout;

  // All roles in priority order.
  const roles = [
    "button",
    "link",
    "menuitem",
    "tab",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
  ] as const;

  // Build locators for every role and count them in parallel.
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
