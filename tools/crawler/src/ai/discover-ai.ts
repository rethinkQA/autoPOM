/**
 * AI-powered group discovery — orchestrator.
 *
 * Captures the page's accessibility tree + screenshot, sends to
 * an AI provider, then resolves the AI's groups to DOM elements
 * via getByRole.
 */

import type { Page } from "playwright";
import type { ManifestGroup } from "../types.js";
import type { AiProvider } from "./types.js";
import type { AiPageSummary } from "./types.js";
import { capturePageContext } from "./capture.js";
import { cleanupCapture } from "./dom-capture.js";
import { mapGroupsToSelectors } from "./dom-mapper.js";

export interface AiDiscoverOptions {
  /** Limit discovery to elements within this CSS selector. */
  scope?: string;
  /** Pass tag for the manifest (default: "ai-pass-1"). */
  pass?: string;
  /** Previously discovered pages for cross-page naming consistency. */
  previousPages?: AiPageSummary[];
  /**
   * When true (default), drop groups whose elements are not visible.
   * Set to false for manual re-scans where user revealed dynamic elements.
   */
  filterInvisible?: boolean;
}

/**
 * Result from AI discovery — groups mapped to selectors + AI-chosen page name.
 */
export interface AiDiscoverResult {
  /** Short page name chosen by the AI (kebab-case, e.g. "buildings", "login"). */
  pageName: string;
  /** Groups with DOM selectors. */
  groups: ManifestGroup[];
}

/**
 * Discover page groups using an AI provider.
 *
 * 1. Captures a full-page screenshot + accessibility tree
 * 2. Sends both to the AI provider for analysis
 * 3. Maps the AI's response back to DOM elements via getByRole
 * 4. Returns pageName + ManifestGroup[] matching the standard schema
 *
 * If the AI call fails, throws — the caller (crawlPage) handles fallback.
 */
export async function discoverGroupsWithAi(
  page: Page,
  provider: AiProvider,
  options?: AiDiscoverOptions,
): Promise<AiDiscoverResult> {
  const pass = options?.pass ?? "ai-pass-1";

  console.error(`  🤖 AI discovery (${provider.name})…`);

  // 1. Capture page context
  const context = await capturePageContext(page);
  if (options?.previousPages) {
    context.previousPages = options.previousPages;
  }

  console.error(`  🤖 DOM summary (${context.domSummary.length} chars), ARIA snapshot (${context.accessibilityTree.length} chars)`);

  // 2. Send to AI provider
  const result = await provider.analyzePageGroups(context);

  console.error(`  🤖 AI found ${result.groups.length} group(s) (page: "${result.pageName}") — mapping to DOM…`);

  // 3. Map AI groups to DOM selectors via data-pw-cid (+ getByRole fallback)
  const filterInvisible = options?.filterInvisible ?? true;
  const groups = await mapGroupsToSelectors(page, result.groups, pass, filterInvisible);

  // 4. Clean up temporary data-pw-cid attributes
  await cleanupCapture(page);

  console.error(`  🤖 Mapped ${groups.length}/${result.groups.length} group(s) to selectors.`);

  return { pageName: result.pageName, groups };
}
