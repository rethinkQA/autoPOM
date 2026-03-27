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
import { capturePageContext } from "./capture.js";
import { mapGroupsToSelectors } from "./dom-mapper.js";

export interface AiDiscoverOptions {
  /** Limit discovery to elements within this CSS selector. */
  scope?: string;
  /** Pass tag for the manifest (default: "ai-pass-1"). */
  pass?: string;
}

/**
 * Discover page groups using an AI provider.
 *
 * 1. Captures a full-page screenshot + accessibility tree
 * 2. Sends both to the AI provider for analysis
 * 3. Maps the AI's response back to DOM elements with CSS selectors
 * 4. Returns ManifestGroup[] matching the standard schema
 *
 * If the AI call fails, throws — the caller (crawlPage) handles fallback.
 */
export async function discoverGroupsWithAi(
  page: Page,
  provider: AiProvider,
  options?: AiDiscoverOptions,
): Promise<ManifestGroup[]> {
  const pass = options?.pass ?? "ai-pass-1";

  console.error(`  🤖 AI discovery (${provider.name})…`);

  // 1. Capture page context
  const context = await capturePageContext(page);

  console.error(`  🤖 ARIA snapshot (${context.accessibilityTree.length} chars):\n${context.accessibilityTree.slice(0, 300)}…`);

  // 2. Send to AI provider
  const aiGroups = await provider.analyzePageGroups(context);

  console.error(`  🤖 AI found ${aiGroups.length} group(s) — mapping to DOM…`);

  // 3. Map AI groups to DOM selectors
  const groups = await mapGroupsToSelectors(page, aiGroups, pass);

  console.error(`  🤖 Mapped ${groups.length}/${aiGroups.length} group(s) to selectors.`);

  return groups;
}
