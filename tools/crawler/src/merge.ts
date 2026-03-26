/**
 * Manifest merge — append-only merge logic for multi-pass crawling.
 *
 * When re-crawling with an existing manifest:
 * - Groups matched by `selector` are updated (label refresh, timestamp bump).
 * - New groups are appended with their `discoveredIn` pass tag.
 * - Groups not found in current DOM are **kept** (append-only) with
 *   their original `lastSeen` timestamp.
 */

import type { CrawlerManifest, ManifestDiff, ManifestGroup, Visibility } from "./types.js";

/** Current manifest schema version. Bump when the manifest shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Visibility promotion order: static > dynamic > exploration.
 * When merging two groups, the stronger visibility wins.
 */
const VISIBILITY_RANK: Record<Visibility, number> = {
  static: 2,
  dynamic: 1,
  exploration: 0,
};

function promoteVisibility(a: Visibility, b: Visibility): Visibility {
  return VISIBILITY_RANK[a] >= VISIBILITY_RANK[b] ? a : b;
}

/**
 * Compute a stable identity key for a manifest group.
 * Uses `groupType::wrapperType::label` which is invariant across passes.
 * P2-175: include wrapperType to prevent collisions between different
 * group types (e.g., table vs dialog) with the same label.
 */
export function mergeKey(group: ManifestGroup): string {
  return `${group.groupType}::${group.wrapperType}::${group.label}`;
}

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
      schemaVersion: CURRENT_SCHEMA_VERSION,
      url,
      timestamp: now,
      scope,
      passCount: 1,
      groups: newGroups,
    };
  }

  // Warn on version mismatch — the manifest may need migration
  const existingVersion = existing.schemaVersion ?? 1;
  if (existingVersion !== CURRENT_SCHEMA_VERSION) {
    console.warn(
      `Warning: manifest schemaVersion is ${existingVersion}, ` +
      `but current version is ${CURRENT_SCHEMA_VERSION}. ` +
      `The manifest may need migration.`,
    );
  }

  const merged = new Map<string, ManifestGroup>();

  // Start with all existing groups
  for (const group of existing.groups) {
    merged.set(mergeKey(group), group);
  }

  // Merge new groups: update existing, append new
  for (const group of newGroups) {
    const key = mergeKey(group);
    const existingGroup = merged.get(key);
    if (existingGroup) {
      // Update: refresh selector, timestamp, keep discoveredIn from original.
      // When merging exploration data into a crawl-discovered group,
      // preserve the stronger visibility ("static" > "dynamic" > "exploration")
      // but carry over triggeredBy for attribution.
      const mergedVisibility = promoteVisibility(existingGroup.visibility, group.visibility);
      merged.set(key, {
        ...group,
        discoveredIn: existingGroup.discoveredIn,
        visibility: mergedVisibility,
        lastSeen: now,
        // Carry triggeredBy from exploration if the existing didn't have one
        ...(group.triggeredBy && !existingGroup.triggeredBy
          ? { triggeredBy: group.triggeredBy }
          : {}),
        // Preserve existing triggeredBy if present
        ...(existingGroup.triggeredBy ? { triggeredBy: existingGroup.triggeredBy } : {}),
      });
    } else {
      // Append: new group discovered in this pass.
      // Preserve discoveredIn if it's a recorder tag (e.g. "record"),
      // otherwise stamp with the current pass number.
      const isRecorderTag = group.discoveredIn && !group.discoveredIn.startsWith("pass-");
      merged.set(key, {
        ...group,
        discoveredIn: isRecorderTag ? group.discoveredIn : `pass-${pass}`,
        lastSeen: now,
      });
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    url,
    timestamp: now,
    scope,
    passCount: Math.max(existing.passCount, pass),
    groups: Array.from(merged.values()).sort((a, b) => mergeKey(a).localeCompare(mergeKey(b))),
    // P2-252: preserve existing apiDependencies (callers merge new deps externally)
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
  const existingByKey = new Map<string, ManifestGroup>();
  for (const g of manifest.groups) {
    existingByKey.set(mergeKey(g), g);
  }

  const currentByKey = new Map<string, ManifestGroup>();
  for (const g of current) {
    currentByKey.set(mergeKey(g), g);
  }

  const added: ManifestGroup[] = [];
  const removed: ManifestGroup[] = [];
  const changed: ManifestDiff["changed"] = [];

  // Find added and changed
  for (const [key, group] of currentByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      added.push(group);
    } else if (
      existing.selector !== group.selector ||
      existing.wrapperType !== group.wrapperType
    ) {
      changed.push({ mergeKey: key, before: existing, after: group });
    }
  }

  // Find removed
  for (const [key, group] of existingByKey) {
    if (!currentByKey.has(key)) {
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
