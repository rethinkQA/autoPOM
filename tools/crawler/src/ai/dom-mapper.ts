/**
 * DOM mapper — resolves AI-discovered groups to CSS selectors via getByRole.
 *
 * The AI reads the ARIA snapshot and returns accessibilityRole + accessibilityName
 * for each group. This module uses Playwright's getByRole() to locate the exact
 * element, then extracts a stable CSS selector from it.
 *
 * This is a closed loop: the ARIA snapshot comes from Playwright's accessibility
 * engine, and getByRole() queries that same engine — so the match is guaranteed
 * when the AI copies role/name accurately from the tree.
 */

import type { Page, Locator } from "playwright";
import type { AiDiscoveredGroup } from "./types.js";
import type { ManifestGroup, Visibility } from "../types.js";

/**
 * Map AI-discovered groups to ManifestGroup entries with CSS selectors.
 *
 * For each AI group, uses page.getByRole(role, { name }) to find the
 * element, then extracts a CSS selector. Groups that can't be found
 * are dropped with a warning.
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
    const selector = await resolveViaGetByRole(page, group);

    if (!selector) {
      console.warn(
        `  ⚠ Could not map AI group "${group.label}" (${group.accessibilityRole}/${group.accessibilityName}) — skipping.`,
      );
      continue;
    }

    // Deduplicate by selector
    if (usedSelectors.has(selector)) continue;
    usedSelectors.add(selector);

    // Check visibility
    const isVisible = await page.locator(selector).first().isVisible().catch(() => false);

    // On auto-scans, drop invisible elements — they're phantom DOM artifacts
    // (hidden modals, collapsed panels, SPA route leftovers).
    // On manual re-scans (F8), include them as "dynamic" since the user
    // intentionally revealed them.
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

// ── Role-to-tag mapping (for CSS selector construction) ─────

const ROLE_TO_TAG: Record<string, string> = {
  navigation: "nav",
  banner: "header",
  contentinfo: "footer",
  main: "main",
  complementary: "aside",
  form: "form",
  table: "table",
  dialog: "dialog",
  region: "section",
  article: "article",
  search: "search",
};

// ── getByRole resolution ────────────────────────────────────

/**
 * Resolve an AI group to a CSS selector using Playwright's getByRole().
 *
 * 1. Build a getByRole locator from the AI's role + name
 * 2. Check it matches at least one element
 * 3. Extract a stable CSS selector from the matched element
 */
async function resolveViaGetByRole(
  page: Page,
  group: AiDiscoveredGroup,
): Promise<string | null> {
  const role = group.accessibilityRole;
  if (!role) return null;

  // Build the getByRole locator
  const name = group.accessibilityName;
  let locator: Locator;

  if (name) {
    // Try exact match first, then substring
    locator = page.getByRole(role as any, { name, exact: true }).first();
    const exactCount = await locator.count().catch(() => 0);
    if (exactCount === 0) {
      locator = page.getByRole(role as any, { name }).first();
    }
  } else {
    locator = page.getByRole(role as any).first();
  }

  // Verify element exists
  const count = await locator.count().catch(() => 0);
  if (count === 0) return null;

  // Extract a CSS selector from the matched element
  return locator.evaluate((el: Element) => {
    const tag = el.tagName.toLowerCase();

    // 1. ID — most stable
    const id = el.getAttribute("id");
    if (id) return `#${CSS.escape(id)}`;

    // 2. aria-label on the tag
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;

    // 3. role attribute + aria-label/labelledby (for non-semantic elements with explicit role)
    const roleAttr = el.getAttribute("role");
    if (roleAttr) {
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        return `[role="${CSS.escape(roleAttr)}"][aria-labelledby="${CSS.escape(ariaLabelledBy)}"]`;
      }
      // role-only selector if unique
      const byRole = document.querySelectorAll(`[role="${roleAttr}"]`);
      if (byRole.length === 1) return `[role="${CSS.escape(roleAttr)}"]`;
    }

    // 4. Semantic tag (nav, table, etc.) — unique on page?
    const sameTag = document.querySelectorAll(tag);
    if (sameTag.length === 1) return tag;

    // 5. Tag + first class(es) for uniqueness
    const cls = el.className;
    if (cls && typeof cls === "string" && cls.trim()) {
      const first = cls.trim().split(/\s+/)[0];
      const sel = `${tag}.${CSS.escape(first)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
      // Try first two classes
      const parts = cls.trim().split(/\s+/).slice(0, 2);
      if (parts.length === 2) {
        const sel2 = `${tag}.${CSS.escape(parts[0])}.${CSS.escape(parts[1])}`;
        if (document.querySelectorAll(sel2).length === 1) return sel2;
      }
    }

    // 6. Closest named ancestor — find a parent with an id or aria-label
    //    to scope the selector (e.g. "#products-section table")
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

    // 7. nth-of-type disambiguation for duplicate semantic tags
    if (sameTag.length > 1) {
      const siblings = Array.from(sameTag);
      const index = siblings.indexOf(el);
      if (index >= 0) {
        // Use :nth-of-type (1-based) — works for semantic tags like table, nav, form
        const nthSel = `${tag}:nth-of-type(${index + 1})`;
        // Verify it matches (nth-of-type counts among siblings, not document-wide)
        // Fall back to a simple approach: count same-tag among parent's children
        const parent = el.parentElement;
        if (parent) {
          const sameTagChildren = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
          const childIndex = sameTagChildren.indexOf(el);
          if (childIndex >= 0 && sameTagChildren.length > 1) {
            const parentTag = parent.tagName.toLowerCase();
            const parentId = parent.getAttribute("id");
            if (parentId) {
              return `#${CSS.escape(parentId)} > ${tag}:nth-of-type(${childIndex + 1})`;
            }
            // Use document-wide index with :nth-of-type on immediate container
            return `${parentTag} > ${tag}:nth-of-type(${childIndex + 1})`;
          }
        }
      }
    }

    // 8. Fallback: tag + role attribute
    if (roleAttr) return `${tag}[role="${CSS.escape(roleAttr)}"]`;

    // 9. Last resort: bare tag
    return tag;
  });
}
