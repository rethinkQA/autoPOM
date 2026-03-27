/**
 * DOM mapper — resolves AI-discovered groups to CSS selectors.
 *
 * The AI identifies groups by label and accessibility role/name.
 * This module maps those descriptions back to real DOM elements
 * and builds stable CSS selectors for each one.
 *
 * Strategy (in priority order):
 * 1. Match by ARIA role + accessible name → locate via Playwright
 * 2. Match by semantic tag + text content
 * 3. Fallback: skip the group (log a warning)
 */

import type { Page } from "playwright";
import type { AiDiscoveredGroup } from "./types.js";
import type { ManifestGroup, Visibility } from "../types.js";

/**
 * Map AI-discovered groups to ManifestGroup entries with CSS selectors.
 *
 * For each AI group, attempts to find the corresponding DOM element
 * and build a selector. Groups that can't be mapped are dropped
 * with a console warning.
 */
export async function mapGroupsToSelectors(
  page: Page,
  aiGroups: AiDiscoveredGroup[],
  pass: string,
): Promise<ManifestGroup[]> {
  const now = new Date().toISOString();
  const results: ManifestGroup[] = [];
  const usedSelectors = new Set<string>();

  for (const group of aiGroups) {
    const selector = await resolveSelector(page, group);

    if (!selector) {
      console.warn(
        `  ⚠ Could not map AI group "${group.label}" (${group.accessibilityRole}/${group.accessibilityName}) to a DOM element — skipping.`,
      );
      continue;
    }

    // Deduplicate by selector
    if (usedSelectors.has(selector)) continue;
    usedSelectors.add(selector);

    // Check visibility
    const isVisible = await page.locator(selector).first().isVisible().catch(() => false);

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

// ── Selector resolution strategies ──────────────────────────

/**
 * Try multiple strategies to find the DOM element for an AI group.
 * Returns a CSS selector or null if no match is found.
 */
async function resolveSelector(
  page: Page,
  group: AiDiscoveredGroup,
): Promise<string | null> {
  // Strategy 1: ARIA role + name → role-based locator
  if (group.accessibilityRole && group.accessibilityName) {
    const selector = await tryRoleSelector(page, group.accessibilityRole, group.accessibilityName);
    if (selector) return selector;
  }

  // Strategy 2: ARIA role only (if name is generic like "navigation")
  if (group.accessibilityRole) {
    const selector = await tryRoleOnlySelector(page, group.accessibilityRole, group.label);
    if (selector) return selector;
  }

  // Strategy 3: Semantic tag matching by groupType/wrapperType
  const selector = await trySemanticTagSelector(page, group);
  if (selector) return selector;

  // Strategy 4: Broad search — ID substrings, heading text, aria-label text
  const broadSelector = await tryBroadSearch(page, group);
  if (broadSelector) return broadSelector;

  return null;
}

/**
 * Strategy 1: Match via role + accessible name.
 * Uses page.evaluate to find elements with matching role and aria-label.
 */
async function tryRoleSelector(
  page: Page,
  role: string,
  name: string,
): Promise<string | null> {
  return page.evaluate(
    ({ role, name }: { role: string; name: string }) => {
      // Map a11y roles to HTML tags and role attributes
      const tagMap: Record<string, string[]> = {
        navigation: ["nav"],
        banner: ["header"],
        contentinfo: ["footer"],
        main: ["main"],
        complementary: ["aside"],
        form: ["form"],
        table: ["table"],
        dialog: ["dialog"],
        toolbar: ["[role='toolbar']"],
        tablist: ["[role='tablist']"],
        menu: ["[role='menu']"],
        menubar: ["[role='menubar']"],
        region: ["section", "[role='region']"],
        group: ["fieldset", "[role='group']"],
      };

      function buildSelector(el: Element): string | null {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
        const cls = el.className;
        if (cls && typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          const sel = `${tag}.${CSS.escape(first)}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
        return tag;
      }

      // Try matching by role attribute
      const byRole = document.querySelectorAll(`[role="${role}"]`);
      for (const el of byRole) {
        const elName = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 50) ?? "";
        if (elName.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(elName.toLowerCase())) {
          return buildSelector(el);
        }
      }

      // Try matching by semantic tag
      const tags = tagMap[role] ?? [];
      for (const tagSel of tags) {
        const elements = document.querySelectorAll(tagSel);
        for (const el of elements) {
          const elName = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 50) ?? "";
          if (elName.toLowerCase().includes(name.toLowerCase()) ||
              name.toLowerCase().includes(elName.toLowerCase())) {
            return buildSelector(el);
          }
        }
        // If there's exactly one element with this tag, use it
        if (elements.length === 1) {
          return buildSelector(elements[0]);
        }
      }

      return null;
    },
    { role, name },
  );
}

/**
 * Strategy 2: Match by role only when there's a single element with that role.
 */
async function tryRoleOnlySelector(
  page: Page,
  role: string,
  label: string,
): Promise<string | null> {
  return page.evaluate(
    ({ role, label }: { role: string; label: string }) => {
      const tagMap: Record<string, string> = {
        navigation: "nav",
        banner: "header",
        contentinfo: "footer",
        main: "main",
        complementary: "aside",
        form: "form",
        table: "table",
        dialog: "dialog",
      };

      function buildSelector(el: Element): string | null {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
        const cls = el.className;
        if (cls && typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          const sel = `${tag}.${CSS.escape(first)}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
        return null;
      }

      // Try semantic tag
      const tag = tagMap[role];
      if (tag) {
        const elements = document.querySelectorAll(tag);
        if (elements.length === 1) return buildSelector(elements[0]);
        // Multiple: try to match by label text
        for (const el of elements) {
          const text = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 80) ?? "";
          if (text.toLowerCase().includes(label.toLowerCase())) {
            return buildSelector(el);
          }
        }
      }

      // Try role attribute
      const byRole = document.querySelectorAll(`[role="${role}"]`);
      if (byRole.length === 1) return buildSelector(byRole[0]);

      return null;
    },
    { role, label },
  );
}

/**
 * Strategy 3: Match by semantic tag + group type heuristics.
 */
async function trySemanticTagSelector(
  page: Page,
  group: AiDiscoveredGroup,
): Promise<string | null> {
  return page.evaluate(
    ({ groupType, wrapperType, label }: { groupType: string; wrapperType: string; label: string }) => {
      function buildSelector(el: Element): string | null {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
        const cls = el.className;
        if (cls && typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          const sel = `${tag}.${CSS.escape(first)}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
        return null;
      }

      // Map groupType/wrapperType to likely tags
      const candidates: string[] = [];
      if (wrapperType === "table") candidates.push("table");
      if (wrapperType === "dialog") candidates.push("dialog", "[role='dialog']");
      if (groupType === "nav") candidates.push("nav");
      if (groupType === "header") candidates.push("header");
      if (groupType === "footer") candidates.push("footer");
      if (groupType === "main") candidates.push("main");
      if (groupType === "aside") candidates.push("aside");
      if (groupType === "form") candidates.push("form");
      if (groupType === "fieldset") candidates.push("fieldset");
      if (groupType === "tablist") candidates.push("[role='tablist']");
      if (groupType === "toolbar") candidates.push("[role='toolbar']");
      if (groupType === "section") candidates.push("section", "[role='region']");

      for (const sel of candidates) {
        const elements = document.querySelectorAll(sel);
        // Single match — use it
        if (elements.length === 1) return buildSelector(elements[0]);
        // Multiple — try to match by label
        for (const el of elements) {
          const text = el.getAttribute("aria-label") ??
            el.querySelector("h1,h2,h3,h4,h5,h6,legend")?.textContent?.trim() ?? "";
          if (text && label.toLowerCase().includes(text.toLowerCase())) {
            return buildSelector(el);
          }
        }
      }

      return null;
    },
    { groupType: group.groupType, wrapperType: group.wrapperType, label: group.label },
  );
}

/**
 * Strategy 4: Broad search using label keywords.
 *
 * Tokenizes the AI label into keywords and searches the DOM for:
 *  a) Elements whose ID contains one of the keywords
 *  b) Container elements whose heading/legend text matches
 *  c) Elements whose aria-label contains a keyword
 *  d) Container elements (section/div/form/fieldset/nav/aside/…) with a
 *     class name that contains a keyword
 *
 * Only returns a match for group-like containers, not individual
 * interactive elements (button, input, link, etc.).
 */
async function tryBroadSearch(
  page: Page,
  group: AiDiscoveredGroup,
): Promise<string | null> {
  // Build keywords from the label (2+ chars, lowercased, no stop words)
  const stopWords = new Set(["the", "a", "an", "of", "in", "on", "to", "for", "and", "or", "is", "it"]);
  const keywords = group.label
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  if (keywords.length === 0) return null;

  return page.evaluate(
    ({ keywords, accessibilityName }: { keywords: string[]; accessibilityName: string }) => {
      const CONTAINER_TAGS = new Set([
        "div", "section", "article", "aside", "main", "nav", "header",
        "footer", "form", "fieldset", "table", "dialog", "details",
        "ul", "ol", "dl",
      ]);

      function isContainer(el: Element): boolean {
        return CONTAINER_TAGS.has(el.tagName.toLowerCase()) ||
          el.hasAttribute("role");
      }

      function buildSelector(el: Element): string | null {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
        const cls = el.className;
        if (cls && typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          const sel = `${tag}.${CSS.escape(first)}`;
          if (document.querySelectorAll(sel).length === 1) return sel;
          // Try more specific: first two classes
          const parts = cls.trim().split(/\s+/).slice(0, 2);
          if (parts.length === 2) {
            const sel2 = `${tag}.${CSS.escape(parts[0])}.${CSS.escape(parts[1])}`;
            if (document.querySelectorAll(sel2).length === 1) return sel2;
          }
        }
        return null;
      }

      // (a) Match by ID containing a keyword
      for (const kw of keywords) {
        const els = document.querySelectorAll(`[id*="${kw}" i]`);
        for (const el of els) {
          if (isContainer(el)) {
            const sel = buildSelector(el);
            if (sel) return sel;
          }
        }
      }

      // (b) Match container whose heading/legend text contains a keyword
      const headingContainers = document.querySelectorAll(
        "section, div, form, fieldset, nav, aside, article, main, header, footer, details, [role]"
      );
      for (const container of headingContainers) {
        const heading = container.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > legend, :scope > caption");
        if (!heading) continue;
        const headingText = heading.textContent?.trim().toLowerCase() ?? "";
        const matches = keywords.some((kw) => headingText.includes(kw));
        if (matches) {
          const sel = buildSelector(container);
          if (sel) return sel;
        }
      }

      // (c) Match by aria-label containing a keyword
      for (const kw of keywords) {
        const els = document.querySelectorAll(`[aria-label*="${kw}" i]`);
        for (const el of els) {
          if (isContainer(el)) {
            const sel = buildSelector(el);
            if (sel) return sel;
          }
        }
      }

      // (d) Match container whose class name contains a keyword
      for (const kw of keywords) {
        const els = document.querySelectorAll(`[class*="${kw}" i]`);
        for (const el of els) {
          if (isContainer(el)) {
            const sel = buildSelector(el);
            if (sel) return sel;
          }
        }
      }

      // (e) Last resort: match by accessibilityName if provided
      if (accessibilityName) {
        const nameWords = accessibilityName.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        for (const nw of nameWords) {
          const els = document.querySelectorAll(`[id*="${nw}" i], [aria-label*="${nw}" i], [class*="${nw}" i]`);
          for (const el of els) {
            if (isContainer(el)) {
              const sel = buildSelector(el);
              if (sel) return sel;
            }
          }
        }
      }

      return null;
    },
    { keywords, accessibilityName: group.accessibilityName ?? "" },
  );
}
