/**
 * AI-powered group discovery — orchestrator.
 *
 * Supports two modes:
 *   1. Full AI discovery: capture → AI → DOM mapper (legacy)
 *   2. Hybrid curation: heuristics discover → AI names + filters (preferred)
 */

import type { Page } from "playwright";
import type { ManifestGroup } from "../types.js";
import type { AiProvider, AiCurationCandidate } from "./types.js";
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

// ── Hybrid curation ─────────────────────────────────────────

/**
 * Curate heuristic-discovered groups using AI.
 *
 * 1. Takes ManifestGroup[] from heuristic discovery (already have valid selectors)
 * 2. Captures screenshot + ARIA tree for visual context
 * 3. Sends candidates to AI for naming + junk filtering
 * 4. Returns only the groups the AI kept, with improved labels
 */
export async function curateGroupsWithAi(
  page: Page,
  provider: AiProvider,
  heuristicGroups: ManifestGroup[],
  options?: AiDiscoverOptions,
): Promise<AiDiscoverResult> {
  const pass = options?.pass ?? "ai-pass-1";

  // Fallback: if provider doesn't support curation, keep all with heuristic labels
  if (!provider.curateGroups) {
    console.error(`  🤖 Provider ${provider.name} doesn't support curation — using heuristic labels.`);
    return { pageName: "page", groups: heuristicGroups };
  }

  console.error(`  🤖 AI curation (${provider.name}) — ${heuristicGroups.length} candidate(s)…`);

  // 1. Capture page context
  const context = await capturePageContext(page);

  // 2. Build candidate list from heuristic groups
  const candidates: AiCurationCandidate[] = heuristicGroups.map((g, i) => {
    const c: AiCurationCandidate = {
      index: i,
      selector: g.selector,
      tagName: g.selector.split(/[\s>[\]#.]/)[0] || "div",
      groupType: g.groupType,
      wrapperType: g.wrapperType,
      heuristicLabel: g.label,
      labelSource: (g as any)._labelSource ?? "unknown",
    };
    return c;
  });

  // 3. Send to AI for curation
  const result = await provider.curateGroups({
    screenshot: context.screenshot,
    accessibilityTree: context.accessibilityTree,
    url: context.url,
    candidates,
    previousPages: options?.previousPages,
  });

  // 4. Apply decisions — keep only accepted groups with AI labels
  const kept: ManifestGroup[] = [];
  const removed: string[] = [];

  for (const decision of result.decisions) {
    const group = heuristicGroups[decision.index];
    if (!group) continue;

    if (decision.action === "keep") {
      kept.push({
        ...group,
        label: decision.label || group.label,
        discoveredIn: pass,
      });
    } else {
      removed.push(`${group.label} (${decision.reason ?? "filtered"})`);
    }
  }

  console.error(`  🤖 Curated: ${kept.length} kept, ${removed.length} removed (page: "${result.pageName}")`);
  if (removed.length > 0) {
    console.error(`  🤖 Removed: ${removed.join(", ")}`);
  }

  return { pageName: result.pageName, groups: kept };
}
