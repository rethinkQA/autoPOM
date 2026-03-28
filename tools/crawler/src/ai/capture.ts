/**
 * Page context capture — screenshot + accessibility tree.
 *
 * Gathers the inputs the AI provider needs to analyze a page:
 * a full-page screenshot (PNG) and the Playwright accessibility
 * tree snapshot.
 */

import type { Page } from "playwright";
import type { AiPageInput } from "./types.js";
import { safePathname } from "../naming.js";
import { captureDomTree, formatDomSummary } from "./dom-capture.js";

/**
 * Capture screenshot, accessibility tree, and DOM container summary.
 *
 * All three operations contribute different information:
 * - Screenshot: visual context for the AI
 * - ARIA snapshot: semantic roles and names for accessibility-aware elements
 * - DOM summary: structural containers with visual metadata (borders,
 *   dimensions, headings, interactivity) — catches sections that lack
 *   ARIA landmarks. Each node gets a data-pw-cid for mapper resolution.
 */
export async function capturePageContext(page: Page): Promise<AiPageInput> {
  const [screenshot, ariaSnapshot, domTree] = await Promise.all([
    page.screenshot({ fullPage: true, type: "png" }),
    page.locator("body").ariaSnapshot(),
    captureDomTree(page),
  ]);

  return {
    screenshot,
    accessibilityTree: ariaSnapshot,
    domSummary: formatDomSummary(domTree),
    url: safePathname(page.url()),
  };
}
