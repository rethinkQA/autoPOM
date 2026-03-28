/**
 * Page context capture — screenshot + accessibility tree + cleaned DOM.
 *
 * Gathers the inputs the AI provider needs to analyze a page:
 * a full-page screenshot (PNG), the Playwright accessibility
 * tree snapshot, and a cleaned HTML representation of the DOM.
 */

import type { Page } from "playwright";
import type { AiPageInput } from "./types.js";
import { safePathname } from "../naming.js";
import { captureCleanedDom } from "./dom-capture.js";

/**
 * Capture screenshot, accessibility tree, and cleaned DOM HTML.
 *
 * All three operations contribute different information:
 * - Screenshot: visual context for the AI
 * - ARIA snapshot: semantic roles and names for accessibility-aware elements
 * - Cleaned DOM: full page structure as simplified HTML — the AI sees
 *   every element and decides what's meaningful. Each block-level element
 *   gets a data-pw-cid for mapper resolution.
 */
export async function capturePageContext(page: Page): Promise<AiPageInput> {
  const [screenshot, ariaSnapshot, cleanedDom] = await Promise.all([
    page.screenshot({ fullPage: true, type: "png" }),
    page.locator("body").ariaSnapshot(),
    captureCleanedDom(page),
  ]);

  return {
    screenshot,
    accessibilityTree: ariaSnapshot,
    cleanedDom,
    url: safePathname(page.url()),
  };
}
