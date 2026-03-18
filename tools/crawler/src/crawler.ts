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
import { NetworkObserver } from "./network.js";

/**
 * Crawl a live page and produce a manifest of discovered groups.
 *
 * @param page      The Playwright Page (already navigated to the target URL).
 * @param options   Crawl options (scope, pass number, network observation).
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

  let networkObserver: NetworkObserver | undefined;
  if (options?.observeNetwork) {
    networkObserver = new NetworkObserver(page);
    networkObserver.start();
  }

  // Wait for the page to be reasonably stable
  await page.waitForLoadState("domcontentloaded");

  // Discover groups and toasts in parallel
  const [groups, toasts] = await Promise.all([
    discoverGroups(page, { scope: scope ?? undefined, pass: passTag }),
    discoverToasts(page, { scope: scope ?? undefined, pass: passTag }),
  ]);

  // Combine all discovered entries
  const allGroups: ManifestGroup[] = [...groups, ...toasts];

  // Stop network observation if active
  let manifest: CrawlerManifest;
  if (existing) {
    manifest = mergeManifest(existing, allGroups, page.url(), pass, scope);
  } else {
    manifest = mergeManifest(null, allGroups, page.url(), pass, scope);
  }

  // Attach API dependencies if network was observed
  if (networkObserver) {
    const deps = networkObserver.stop();
    if (deps.length > 0) {
      manifest.apiDependencies = [
        ...(manifest.apiDependencies ?? []),
        ...deps,
      ];
    }
  }

  return manifest;
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
