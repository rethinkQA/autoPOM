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

  // Discover groups and toasts in parallel
  let groups: ManifestGroup[];
  let toasts: ManifestGroup[];
  try {
    [groups, toasts] = await Promise.all([
      discoverGroups(page, { scope: scope ?? undefined, pass: passTag }),
      discoverToasts(page, { scope: scope ?? undefined, pass: passTag }),
    ]);
  } catch (err) {
    // Stop network observation to avoid leaking page event listeners
    // into subsequent operations on the same page.
    networkObserver?.stop();
    throw err;
  }

  // Combine all discovered entries
  const allGroups: ManifestGroup[] = [...groups, ...toasts];

  // Build or merge the manifest
  let manifest: CrawlerManifest;
  try {
    if (existing) {
      manifest = mergeManifest(existing, allGroups, page.url(), pass, scope);
    } else {
      manifest = mergeManifest(null, allGroups, page.url(), pass, scope);
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
