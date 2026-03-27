/**
 * Crawler — main entry point for runtime page crawling.
 *
 * Coordinates group discovery, special wrapper detection, toast
 * discovery, and optional network observation into a single
 * CrawlerManifest output.
 */

import type { Page } from "playwright";
import type { CrawlOptions, CrawlerManifest, ManifestDiff, ManifestGroup } from "./types.js";
import { discoverGroups, discoverToasts } from "./discover.js";
import { mergeManifest, diffManifest } from "./merge.js";
import { safePathname } from "./naming.js";
import { NetworkObserver } from "./network.js";

/**
 * Crawl a live page and produce a manifest of discovered groups.
 *
 * @param page      The Playwright Page (already navigated to the target URL).
 * @param options   Crawl options (scope, pass number, network observation, AI provider).
 *                  NOTE: `observeNetwork` only captures requests that occur after
 *                  this call — page-load requests fired during the initial
 *                  navigation are not observed. To capture page-load traffic,
 *                  start the `NetworkObserver` manually before calling `page.goto()`.
 * @param existing  An existing manifest to merge into (for multi-pass crawling).
 * @returns The new or merged CrawlerManifest.
 */
export async function crawlPage(
  page: Page,
  options?: CrawlOptions,
  existing?: CrawlerManifest | null,
): Promise<CrawlerManifest> {
  const scope = options?.scope ?? null;
  const pass = options?.pass ?? 1;
  const passTag = `pass-${pass}`;

  // Start network observation BEFORE waiting for load state so we
  // capture as many in-flight requests as possible.
  let networkObserver: NetworkObserver | undefined;
  if (options?.observeNetwork) {
    networkObserver = new NetworkObserver(page);
    networkObserver.start();
  }

  // Wait for the page to be reasonably stable
  await page.waitForLoadState("domcontentloaded");

  // Discover groups — AI-powered or heuristic
  let allGroups: ManifestGroup[];

  if (options?.aiProvider) {
    // AI-powered discovery merged with heuristics for best coverage
    try {
      const { discoverGroupsWithAi } = await import("./ai/discover-ai.js");
      const aiGroups = await discoverGroupsWithAi(page, options.aiProvider, {
        scope: scope ?? undefined,
        pass: passTag,
      });
      // Always run heuristics and merge — AI adds semantic labels,
      // heuristics catch structural elements the AI might miss.
      const heuristicGroups = await heuristicDiscovery(page, scope, passTag);
      allGroups = mergeGroups(aiGroups, heuristicGroups);
      console.error(`  ✓ Merged: ${aiGroups.length} AI + ${heuristicGroups.length} heuristic → ${allGroups.length} unique groups`);
    } catch (err) {
      console.error(`  ⚠ AI discovery failed, falling back to heuristics: ${err}`);
      allGroups = await heuristicDiscovery(page, scope, passTag);
    }
  } else {
    allGroups = await heuristicDiscovery(page, scope, passTag);
  }

  // Build or merge the manifest
  let manifest: CrawlerManifest;
  try {
    if (existing) {
      manifest = mergeManifest(existing, allGroups, safePathname(page.url()), pass, scope);
    } else {
      manifest = mergeManifest(null, allGroups, safePathname(page.url()), pass, scope);
    }
  } catch (err) {
    // P2-192/P2-263: ensure observer cleanup on merge failure
    networkObserver?.stop();
    throw err;
  }

  // Attach API dependencies if network was observed
  if (networkObserver) {
    const deps = networkObserver.stop();
    if (deps.length > 0) {
      // P2-191: Deduplicate by method:pattern before assigning
      const seen = new Map<string, (typeof deps)[number]>();
      for (const d of [...(manifest.apiDependencies ?? []), ...deps]) {
        const key = `${d.method}:${d.pattern}`;
        if (!seen.has(key)) seen.set(key, d);
      }
      manifest.apiDependencies = Array.from(seen.values());
    }
  }

  return manifest;
}

/**
 * Standard heuristic discovery — semantic groups + toasts + implicit groups.
 */
async function heuristicDiscovery(
  page: Page,
  scope: string | null,
  passTag: string,
): Promise<ManifestGroup[]> {
  let groups: ManifestGroup[];
  let toasts: ManifestGroup[];

  [groups, toasts] = await Promise.all([
    discoverGroups(page, { scope: scope ?? undefined, pass: passTag }),
    discoverToasts(page, { scope: scope ?? undefined, pass: passTag }),
  ]);

  return [...groups, ...toasts];
}

/**
 * Merge AI-discovered groups with heuristic groups, deduplicating by
 * selector. AI groups take priority (better labels), heuristic groups
 * fill in anything the AI missed.
 */
function mergeGroups(aiGroups: ManifestGroup[], heuristicGroups: ManifestGroup[]): ManifestGroup[] {
  const seen = new Map<string, ManifestGroup>();

  // AI groups first — they have better semantic labels
  for (const g of aiGroups) {
    seen.set(g.selector, g);
  }

  // Heuristic groups fill in gaps
  for (const g of heuristicGroups) {
    if (!seen.has(g.selector)) {
      seen.set(g.selector, g);
    }
  }

  return Array.from(seen.values());
}

/**
 * Compare the current live page against an existing manifest.
 *
 * @param page      The Playwright Page (already navigated).
 * @param manifest  The existing manifest to compare against.
 * @param options   Crawl options (scope).
 * @returns A diff describing additions, removals, and changes.
 */
export async function diffPage(
  page: Page,
  manifest: CrawlerManifest,
  options?: Pick<CrawlOptions, "scope">,
): Promise<ManifestDiff> {
  const scope = options?.scope ?? null;

  await page.waitForLoadState("domcontentloaded");

  const [groups, toasts] = await Promise.all([
    discoverGroups(page, { scope: scope ?? undefined }),
    discoverToasts(page, { scope: scope ?? undefined }),
  ]);

  return diffManifest(manifest, [...groups, ...toasts]);
}
