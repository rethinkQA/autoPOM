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

/**
 * Capture screenshot and accessibility tree from a live page.
 *
 * Both operations run in parallel for speed. The screenshot is
 * a full-page PNG; the ARIA snapshot is a compact YAML representation
 * from Playwright's `locator.ariaSnapshot()` API.
 */
export async function capturePageContext(page: Page): Promise<AiPageInput> {
  const [screenshot, ariaSnapshot] = await Promise.all([
    page.screenshot({ fullPage: true, type: "png" }),
    page.locator("body").ariaSnapshot(),
  ]);

  return {
    screenshot,
    accessibilityTree: ariaSnapshot,
    url: safePathname(page.url()),
  };
}
