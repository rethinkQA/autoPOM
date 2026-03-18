/**
 * Manifest merge — append-only merge logic for multi-pass crawling.
 *
 * When re-crawling with an existing manifest:
 * - Groups matched by `selector` are updated (label refresh, timestamp bump).
 * - New groups are appended with their `discoveredIn` pass tag.
 * - Groups not found in current DOM are **kept** (append-only) with
 *   their original `lastSeen` timestamp.
 */

import type { CrawlerManifest, ManifestDiff, ManifestGroup } from "./types.js";

/**
 * Merge new crawl results into an existing manifest.
 *
 * @param existing   The previous manifest (or null for first crawl).
 * @param newGroups  Groups discovered in the current pass.
 * @param url        The URL that was crawled.
 * @param pass       The pass number (1-indexed).
 * @param scope      The CSS scope selector used (null = full page).
 * @returns The merged manifest.
 */
export function mergeManifest(
  existing: CrawlerManifest | null,
  newGroups: ManifestGroup[],
  url: string,
  pass: number,
  scope: string | null,
): CrawlerManifest {
  const now = new Date().toISOString();

  if (!existing) {
    return {
      schemaVersion: 1,
      url,
      timestamp: now,
      scope,
      passCount: 1,
      groups: newGroups,
    };
  }

  const merged = new Map<string, ManifestGroup>();

  // Start with all existing groups
  for (const group of existing.groups) {
    merged.set(group.selector, group);
  }

  // Merge new groups: update existing, append new
  for (const group of newGroups) {
    const existingGroup = merged.get(group.selector);
    if (existingGroup) {
      // Update: refresh label, timestamp, keep discoveredIn from original
      merged.set(group.selector, {
        ...group,
        discoveredIn: existingGroup.discoveredIn,
        lastSeen: now,
      });
    } else {
      // Append: new group discovered in this pass
      merged.set(group.selector, {
        ...group,
        discoveredIn: `pass-${pass}`,
        lastSeen: now,
      });
    }
  }

  return {
    schemaVersion: existing.schemaVersion ?? 1,
    url,
    timestamp: now,
    scope,
    passCount: Math.max(existing.passCount, pass),
    groups: Array.from(merged.values()),
    apiDependencies: existing.apiDependencies,
  };
}

/**
 * Compute the diff between a manifest and a new set of discovered groups.
 *
 * @param manifest   The existing manifest to compare against.
 * @param current    The groups discovered in the current crawl.
 * @returns A diff describing additions, removals, and changes.
 */
export function diffManifest(
  manifest: CrawlerManifest,
  current: ManifestGroup[],
): ManifestDiff {
  const existingBySelector = new Map<string, ManifestGroup>();
  for (const g of manifest.groups) {
    existingBySelector.set(g.selector, g);
  }

  const currentBySelector = new Map<string, ManifestGroup>();
  for (const g of current) {
    currentBySelector.set(g.selector, g);
  }

  const added: ManifestGroup[] = [];
  const removed: ManifestGroup[] = [];
  const changed: ManifestDiff["changed"] = [];

  // Find added and changed
  for (const [selector, group] of currentBySelector) {
    const existing = existingBySelector.get(selector);
    if (!existing) {
      added.push(group);
    } else if (
      existing.label !== group.label ||
      existing.groupType !== group.groupType ||
      existing.wrapperType !== group.wrapperType
    ) {
      changed.push({ selector, before: existing, after: group });
    }
  }

  // Find removed
  for (const [selector, group] of existingBySelector) {
    if (!currentBySelector.has(selector)) {
      removed.push(group);
    }
  }

  return {
    added,
    removed,
    changed,
    unchanged: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}
