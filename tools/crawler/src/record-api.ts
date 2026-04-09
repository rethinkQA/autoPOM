/**
 * Programmatic API for DOM flight recording.
 *
 * Provides `recordPage()` — a convenience wrapper that starts a
 * DomRecorder, runs a user-supplied interaction callback, then
 * harvests and merges the results.
 */

import type { Page } from "playwright";
import type { CrawlerManifest, RecordOptions } from "./types.js";
import { DomRecorder } from "./recorder.js";
import { mergeManifest } from "./merge.js";
import { safePathname } from "./naming.js";

/**
 * Record dynamic DOM elements that appear during user interaction.
 *
 * @param page       A Playwright Page that has already navigated to the target URL.
 * @param interact   Async callback where the caller triggers UI actions
 *                   (open dialogs, trigger toasts, etc.). The recorder is
 *                   active for the duration of this callback.
 * @param options    Optional: existing manifest to merge into, scope selector.
 * @returns A merged CrawlerManifest containing both existing and newly recorded groups.
 */
export async function recordPage(
  page: Page,
  interact: (page: Page) => Promise<void>,
  options?: RecordOptions,
): Promise<CrawlerManifest> {
  const recorder = new DomRecorder(page, options?.scope);
  await recorder.start();

  let interactError: unknown;
  try {
    await interact(page);
  } catch (err) {
    interactError = err;
  }

  const pages = await recorder.harvestByPage();
  await recorder.stop();

  // Flatten groups for mergeManifest
  const groups = pages.flatMap(p => p.groups);

  // Collect all apiDependencies across pages
  const allApiDeps = pages.flatMap(p => p.apiDependencies ?? []);

  const path = safePathname(page.url());
  const pass = (options?.existing?.passCount ?? 0) + 1;
  const result = mergeManifest(
    options?.existing ?? null,
    groups,
    path,
    pass,
    options?.scope ?? null,
  );

  // Attach API dependencies to the manifest
  if (allApiDeps.length > 0) {
    const existing = result.apiDependencies ?? [];
    const seen = new Map<string, (typeof allApiDeps)[0]>();
    for (const d of [...existing, ...allApiDeps]) {
      const key = `${d.method}:${d.pattern}`;
      if (!seen.has(key)) seen.set(key, d);
    }
    result.apiDependencies = Array.from(seen.values());
  }

  // Attach action navigations to the manifest
  const allActionNavs = pages.flatMap(p => p.actionNavigations ?? []);
  if (allActionNavs.length > 0) {
    const existing = result.actionNavigations ?? [];
    const seen = new Map<string, (typeof allActionNavs)[0]>();
    for (const n of [...existing, ...allActionNavs]) {
      const key = `${n.triggeredBy}::${n.navigatesTo}`;
      if (!seen.has(key)) seen.set(key, n);
    }
    result.actionNavigations = Array.from(seen.values());
  }

  if (interactError) throw interactError;

  return result;
}
