/**
 * AI-powered group discovery — orchestrator.
 *
 * Coordinates the full AI discovery pipeline:
 *   capture page context → send to AI → map results to DOM selectors
 *
 * Falls back to heuristic discovery if the AI call fails.
 */

import type { Page } from "playwright";
import type { ManifestGroup } from "../types.js";
import type { AiProvider } from "./types.js";
import type { AiPageSummary } from "./types.js";
import { capturePageContext } from "./capture.js";
import { mapGroupsToSelectors } from "./dom-mapper.js";

export interface AiDiscoverOptions {
  /** Limit discovery to elements within this CSS selector. */
  scope?: string;
  /** Pass tag for the manifest (default: "ai-pass-1"). */
  pass?: string;
  /** Previously discovered pages for cross-page naming consistency. */
  previousPages?: AiPageSummary[];
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
 * 3. Maps the AI's response back to DOM elements with CSS selectors
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

  console.error(`  🤖 ARIA snapshot (${context.accessibilityTree.length} chars):\n${context.accessibilityTree.slice(0, 300)}…`);

  // 2. Send to AI provider
  const result = await provider.analyzePageGroups(context);

  console.error(`  🤖 AI found ${result.groups.length} group(s) (page: "${result.pageName}") — mapping to DOM…`);

  // 3. Map AI groups to DOM selectors
  const groups = await mapGroupsToSelectors(page, result.groups, pass);

  console.error(`  🤖 Mapped ${groups.length}/${result.groups.length} group(s) to selectors.`);

  return { pageName: result.pageName, groups };
}
