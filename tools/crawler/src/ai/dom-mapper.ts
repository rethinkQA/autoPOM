/**
 * DOM mapper — resolves AI-discovered groups to CSS selectors via data-pw-cid.
 *
 * The DOM capture phase assigns each container a `data-pw-cid` attribute.
 * The AI returns a `containerIndex` (cid) for each group. This module
 * locates the element by `[data-pw-cid="N"]`, then extracts a stable CSS
 * selector from it.
 *
 * Fallback: if the AI also provides accessibilityRole + accessibilityName,
 * we try getByRole as a backup when cid lookup fails.
 */

import type { Page, Locator } from "playwright";
import type { AiDiscoveredGroup } from "./types.js";
import type { ManifestGroup, Visibility } from "../types.js";

/**
 * Map AI-discovered groups to ManifestGroup entries with CSS selectors.
 *
 * For each AI group, finds the element by data-pw-cid, then extracts a
 * stable CSS selector. Falls back to getByRole if cid isn't set.
 * Groups that can't be found are dropped with a warning.
 *
 * @param filterInvisible - When true (default for auto-scans), drop
 *   groups whose elements are not currently visible. Set to false for
 *   manual re-scans (F8) where the user revealed dynamic elements.
 */
export async function mapGroupsToSelectors(
  page: Page,
  aiGroups: AiDiscoveredGroup[],
  pass: string,
  filterInvisible = true,
): Promise<ManifestGroup[]> {
  const now = new Date().toISOString();
  const results: ManifestGroup[] = [];
  const usedSelectors = new Set<string>();

  for (const group of aiGroups) {
    const selector = await resolveGroup(page, group);

    if (!selector) {
      console.warn(
        `  ⚠ Could not map AI group "${group.label}" (cid=${group.containerIndex}) — skipping.`,
      );
      continue;
    }

    // Deduplicate by selector
    if (usedSelectors.has(selector)) continue;
    usedSelectors.add(selector);

    // Check visibility
    const isVisible = await page.locator(selector).first().isVisible().catch(() => false);

    // On auto-scans, drop invisible elements — they're phantom DOM artifacts.
    // On manual re-scans (F8), include them as "dynamic".
    if (filterInvisible && !isVisible) {
      console.warn(
        `  👻 Skipping invisible group "${group.label}" (${selector}) — not visible on page.`,
      );
      continue;
    }

    results.push({
      label: group.label,
      selector,
      groupType: group.groupType,
      wrapperType: group.wrapperType,
      discoveredIn: pass,
      visibility: (isVisible ? "static" : "dynamic") as Visibility,
      lastSeen: now,
      ...(group.description ? { notes: group.description } : {}),
    });
  }

  return results;
}

// ── Resolution strategies ───────────────────────────────────

/**
 * Resolve an AI group to a CSS selector.
 *
 * Strategy order:
 *   1. data-pw-cid lookup → extract stable selector from that element
 *   2. getByRole fallback (if AI provided role + name)
 */
async function resolveGroup(
  page: Page,
  group: AiDiscoveredGroup,
): Promise<string | null> {
  // 1. Try cid-based resolution
  if (group.containerIndex != null) {
    const cidSelector = `[data-pw-cid="${group.containerIndex}"]`;
    const count = await page.locator(cidSelector).count().catch(() => 0);
    if (count > 0) {
      const stable = await extractStableSelector(page.locator(cidSelector).first());
      if (stable) return stable;
    }
  }

  // 2. Fallback: getByRole
  const role = group.accessibilityRole;
  if (role) {
    const name = group.accessibilityName;
    let locator: Locator;

    if (name) {
      locator = page.getByRole(role as any, { name, exact: true }).first();
      const exactCount = await locator.count().catch(() => 0);
      if (exactCount === 0) {
        locator = page.getByRole(role as any, { name }).first();
      }
    } else {
      locator = page.getByRole(role as any).first();
    }

    const count = await locator.count().catch(() => 0);
    if (count > 0) {
      const stable = await extractStableSelector(locator);
      if (stable) return stable;
    }
  }

  return null;
}

// ── Stable CSS selector extraction ──────────────────────────

/**
 * Extract a stable CSS selector from a matched locator.
 * Tries ID → aria-label → role → unique tag → classes → ancestor scoping → nth-of-type.
 */
async function extractStableSelector(locator: Locator): Promise<string | null> {
  return locator.evaluate((el: Element) => {
    const tag = el.tagName.toLowerCase();

    // 1. ID — most stable
    const id = el.getAttribute("id");
    if (id) return `#${CSS.escape(id)}`;

    // 2. aria-label on the tag
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;

    // 3. role attribute + labelling
    const roleAttr = el.getAttribute("role");
    if (roleAttr) {
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        return `[role="${CSS.escape(roleAttr)}"][aria-labelledby="${CSS.escape(ariaLabelledBy)}"]`;
      }
      const byRole = document.querySelectorAll(`[role="${roleAttr}"]`);
      if (byRole.length === 1) return `[role="${CSS.escape(roleAttr)}"]`;
    }

    // 4. Semantic tag — unique on page?
    const sameTag = document.querySelectorAll(tag);
    if (sameTag.length === 1) return tag;

    // 5. Tag + classes for uniqueness
    const cls = el.className;
    if (cls && typeof cls === "string" && cls.trim()) {
      const first = cls.trim().split(/\s+/)[0];
      const sel = `${tag}.${CSS.escape(first)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
      const parts = cls.trim().split(/\s+/).slice(0, 2);
      if (parts.length === 2) {
        const sel2 = `${tag}.${CSS.escape(parts[0])}.${CSS.escape(parts[1])}`;
        if (document.querySelectorAll(sel2).length === 1) return sel2;
      }
    }

    // 6. Closest named ancestor for scoped selector
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) {
      const aId = ancestor.getAttribute("id");
      if (aId) {
        const scoped = `#${CSS.escape(aId)} > ${tag}`;
        if (document.querySelectorAll(scoped).length === 1) return scoped;
        const scopedDesc = `#${CSS.escape(aId)} ${tag}`;
        if (document.querySelectorAll(scopedDesc).length === 1) return scopedDesc;
      }
      const aLabel = ancestor.getAttribute("aria-label");
      if (aLabel) {
        const aTag = ancestor.tagName.toLowerCase();
        const scoped = `${aTag}[aria-label="${CSS.escape(aLabel)}"] ${tag}`;
        if (document.querySelectorAll(scoped).length === 1) return scoped;
      }
      ancestor = ancestor.parentElement;
    }

    // 7. nth-of-type among parent's children
    if (sameTag.length > 1) {
      const parent = el.parentElement;
      if (parent) {
        const sameTagChildren = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
        const childIndex = sameTagChildren.indexOf(el);
        if (childIndex >= 0 && sameTagChildren.length > 1) {
          const parentId = parent.getAttribute("id");
          if (parentId) {
            return `#${CSS.escape(parentId)} > ${tag}:nth-of-type(${childIndex + 1})`;
          }
          const parentTag = parent.tagName.toLowerCase();
          return `${parentTag} > ${tag}:nth-of-type(${childIndex + 1})`;
        }
      }
    }

    // 8. Fallback: tag + role
    if (roleAttr) return `${tag}[role="${CSS.escape(roleAttr)}"]`;

    // 9. Last resort: bare tag
    return tag;
  });
}
