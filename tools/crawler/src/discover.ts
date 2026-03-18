/**
 * Group Discovery — the core crawling algorithm.
 *
 * Queries the live DOM for landmark/container elements in a single
 * querySelectorAll pass, then extracts label + classifies type for
 * each discovered group.
 *
 * Design principle: **groups, not elements.** The framework's
 * group.write() auto-detects element types at runtime via the handler
 * registry. The crawler just finds the named regions of the page.
 */

import type { Page, Locator } from "playwright";
import type { GroupType, ManifestGroup, Visibility, WrapperType } from "./types.js";

// ── Selector for group-like elements ────────────────────────

/**
 * Combined CSS selector that captures all group-like elements in
 * a single querySelectorAll. This covers:
 * - HTML landmark elements (nav, header, footer, main, aside)
 * - Sectioning with labels (section[aria-label], section[aria-labelledby])
 * - Form groupings (fieldset, form)
 * - Tablular data (table)
 * - Dialogs (dialog, [role="dialog"])
 * - Disclosure (details)
 * - ARIA landmarks and widgets with labels
 */
const GROUP_SELECTOR = [
  "nav",
  "header",
  "footer",
  "main",
  "aside",
  "section[aria-label]",
  "section[aria-labelledby]",
  "fieldset",
  "form",
  "table",
  "dialog",
  "details",
  "[role='navigation']",
  "[role='region'][aria-label]",
  "[role='region'][aria-labelledby]",
  "[role='group'][aria-label]",
  "[role='group'][aria-labelledby]",
  "[role='toolbar']",
  "[role='tablist']",
  "[role='menu']",
  "[role='menubar']",
  "[role='table']",
  "[role='dialog']",
  "[role='alertdialog']",
].join(", ");

// ── Label extraction ────────────────────────────────────────

interface RawGroupData {
  /** Unique index for stable ordering. */
  index: number;
  /** Lowercased tag name. */
  tagName: string;
  /** The ARIA role (explicit or implicit). */
  role: string | null;
  /** aria-label attribute value. */
  ariaLabel: string | null;
  /** aria-labelledby attribute value (the ID reference). */
  ariaLabelledBy: string | null;
  /** Text content of <legend> child (for fieldset). */
  legendText: string | null;
  /** Text content of <summary> child (for details). */
  summaryText: string | null;
  /** Text content of first heading child (h1-h6). */
  headingText: string | null;
  /** Text content of any descendant heading (deep search). */
  deepHeadingText: string | null;
  /** title attribute on the element. */
  titleAttr: string | null;
  /** aria-label from the nearest labeled ancestor. */
  nearestAncestorLabel: string | null;
  /** First short text content within the element (fallback). */
  firstTextContent: string | null;
  /** The element's id attribute. */
  id: string | null;
  /** CSS classes for selector building. */
  className: string;
  /** Whether the element is currently visible. */
  isVisible: boolean;
  /** A generated unique CSS selector for this element. */
  selector: string;
}

/**
 * Extract raw group data from all matching elements in a single
 * page.evaluate() call to minimize browser round-trips.
 *
 * Pierces Shadow DOM boundaries so that web-component-based apps
 * (e.g. Lit/Shoelace) are fully crawled.
 */
async function extractRawGroups(root: Page | Locator, scopeSelector?: string): Promise<RawGroupData[]> {
  const page = "page" in root ? (root as Locator).page() : (root as Page);

  return page.evaluate(
    ({ sel, scope }: { sel: string; scope: string | undefined }) => {
      /**
       * Iteratively collect all elements matching `selector` from
       * a root node, piercing any shadow roots encountered.
       * Uses a work queue instead of recursion to avoid O(n²) overhead
       * on deeply nested shadow DOM trees.
       */
      function querySelectorAllDeep(root: ParentNode, selector: string): Element[] {
        const results: Element[] = [];
        const queue: ParentNode[] = [root];

        while (queue.length > 0) {
          const current = queue.shift()!;

          // Collect matching elements in this DOM scope
          for (const el of current.querySelectorAll(selector)) {
            results.push(el);
          }

          // Enqueue shadow roots of all elements in this scope
          for (const el of current.querySelectorAll("*")) {
            if (el.shadowRoot) {
              queue.push(el.shadowRoot);
            }
          }
        }

        return results;
      }

      const container = scope
        ? document.querySelector(scope) ?? document.body
        : document.body;

      const elements = querySelectorAllDeep(container, sel);

      // If the container itself matches the group selector, include it
      if (scope && container !== document.body && container.matches(sel)) {
        // Prepend unless already captured
        if (!elements.includes(container)) {
          elements.unshift(container);
        }
      }
      const results: RawGroupData[] = [];

      elements.forEach((el, index) => {
        const htmlEl = el as HTMLElement;

        // Extract legend text (for fieldset)
        const legend = el.querySelector(":scope > legend");
        const legendText = legend?.textContent?.trim() ?? null;

        // Extract summary text (for details)
        const summary = el.querySelector(":scope > summary");
        const summaryText = summary?.textContent?.trim() ?? null;

        // Extract first heading child text (direct children only)
        const heading = el.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
        const headingText = heading?.textContent?.trim() ?? null;

        // Deep heading search — any descendant heading (h1-h6)
        const deepHeading = !headingText
          ? el.querySelector("h1, h2, h3, h4, h5, h6")
          : null;
        const deepHeadingText = deepHeading?.textContent?.trim() ?? null;

        // title attribute
        const titleAttr = htmlEl.getAttribute("title")?.trim() || null;

        // Nearest ancestor with aria-label (walk up the tree)
        let nearestAncestorLabel: string | null = null;
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== document.body) {
          const ancestorLabel = ancestor.getAttribute("aria-label");
          if (ancestorLabel) {
            nearestAncestorLabel = ancestorLabel.trim();
            break;
          }
          ancestor = ancestor.parentElement;
        }

        // First short text content as last-resort fallback
        // Look for the first text node or short element text
        let firstTextContent: string | null = null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const txt = textNode.textContent?.trim();
          if (txt && txt.length >= 2 && txt.length <= 80) {
            firstTextContent = txt;
            break;
          }
          textNode = walker.nextNode();
        }

        // Resolve aria-labelledby
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        let resolvedLabelledBy: string | null = null;
        if (ariaLabelledBy) {
          const refEl = document.getElementById(ariaLabelledBy);
          resolvedLabelledBy = refEl?.textContent?.trim() ?? ariaLabelledBy;
        }

        // Visibility check
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !htmlEl.hidden &&
          (rect.width > 0 || rect.height > 0);

        // Build a unique selector
        const tagName = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        const className = el.className;

        let selector: string;
        if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (el.getAttribute("aria-label")) {
          selector = `${tagName}[aria-label="${CSS.escape(el.getAttribute("aria-label")!)}"]`;
        } else if (legendText && tagName === "fieldset") {
          // Use :has(> legend) pattern for fieldsets
          selector = `fieldset:has(> legend)`;
          // Disambiguate if needed — we'll refine in post-processing
        } else if (className && typeof className === "string" && className.trim()) {
          const firstClass = className.trim().split(/\s+/)[0];
          selector = `${tagName}.${CSS.escape(firstClass)}`;
        } else {
          selector = tagName;
        }

        results.push({
          index,
          tagName,
          role: el.getAttribute("role"),
          ariaLabel: el.getAttribute("aria-label"),
          ariaLabelledBy: resolvedLabelledBy,
          legendText,
          summaryText,
          headingText,
          deepHeadingText,
          titleAttr,
          nearestAncestorLabel,
          firstTextContent,
          id,
          className: typeof className === "string" ? className : "",
          isVisible,
          selector,
        });
      });

      return results;
    },
    { sel: GROUP_SELECTOR, scope: scopeSelector },
  );
}

// ── Label resolution ────────────────────────────────────────

/**
 * Check if a string looks like a framework-generated ID
 * (React _r_N_, :rN:, Vue data-v-xxx, Angular _ngcontent, etc.)
 * rather than a human-authored one.
 */
function isFrameworkId(id: string): boolean {
  return /^[:_]r[_\d]|^_ng|^data-v-|^__vue|^\$|^:[a-z0-9]+:$|^svelte-[a-z0-9]+$/i.test(id);
}

/**
 * Resolve the best human-readable label for a discovered group.
 * Priority:
 * 1. aria-label
 * 2. aria-labelledby (resolved text)
 * 3. <legend> child (for fieldset)
 * 4. <summary> child (for details)
 * 5. Direct heading child (h1-h6)
 * 6. Any descendant heading (deep search)
 * 7. title attribute
 * 8. Nearest ancestor's aria-label
 * 9. First meaningful text content in the element
 * 10. id attribute (if it looks human-authored)
 * 11. Fallback: tag name
 */
function resolveLabel(raw: RawGroupData): string {
  if (raw.ariaLabel) return raw.ariaLabel;
  if (raw.ariaLabelledBy && !isFrameworkId(raw.ariaLabelledBy)) return raw.ariaLabelledBy;
  if (raw.legendText) return raw.legendText;
  if (raw.summaryText) return raw.summaryText;
  if (raw.headingText) return raw.headingText;
  if (raw.deepHeadingText) return raw.deepHeadingText;
  if (raw.titleAttr) return raw.titleAttr;
  if (raw.nearestAncestorLabel) return raw.nearestAncestorLabel;
  if (raw.firstTextContent) return raw.firstTextContent;
  if (raw.id && !isFrameworkId(raw.id)) return raw.id;
  return raw.tagName;
}

// ── Type classification ─────────────────────────────────────

/** Classify the semantic group type from tag/role. */
function classifyGroupType(raw: RawGroupData): GroupType {
  const role = raw.role;
  const tag = raw.tagName;

  // Explicit ARIA roles take precedence
  if (role === "navigation") return "nav";
  if (role === "toolbar") return "toolbar";
  if (role === "tablist") return "tablist";
  if (role === "menu") return "menu";
  if (role === "menubar") return "menubar";
  if (role === "region") return "region";
  if (role === "group") return "fieldset"; // role="group" is semantically a fieldset

  // Tag-based classification
  if (tag === "nav") return "nav";
  if (tag === "header") return "header";
  if (tag === "footer") return "footer";
  if (tag === "main") return "main";
  if (tag === "aside") return "aside";
  if (tag === "section") return "section";
  if (tag === "fieldset") return "fieldset";
  if (tag === "form") return "form";
  if (tag === "details") return "details";
  if (tag === "table" || role === "table") return "generic";
  if (tag === "dialog" || role === "dialog" || role === "alertdialog") return "generic";

  return "generic";
}

/** Determine the wrapper type for code generation. */
function classifyWrapperType(raw: RawGroupData): WrapperType {
  const tag = raw.tagName;
  const role = raw.role;

  if (tag === "table" || role === "table") return "table";
  if (tag === "dialog" || role === "dialog" || role === "alertdialog") return "dialog";

  return "group";
}

// ── Date picker heuristic ────────────────────────────────────

/**
 * Check if a group is likely a date picker container.
 * Uses label text heuristics since there is no universal DOM signal.
 */
function isDatePickerCandidate(label: string, raw: RawGroupData): boolean {
  const lower = label.toLowerCase();
  const datePatterns = [
    /\bdate\b/,
    /\bdelivery\b/,
    /\bcalendar\b/,
    /\bpick.*date\b/,
    /\bdate.*pick/,
    /\bschedul/,
  ];
  // Only flag fieldset/form groups, not tables or dialogs
  if (raw.tagName !== "fieldset" && raw.role !== "group") return false;
  return datePatterns.some((p) => p.test(lower));
}

// ── Selector refinement ─────────────────────────────────────

/**
 * Disambiguate selectors that might match multiple elements.
 * When two groups share the same selector, append nth-of-type or
 * add the label to make them unique.
 */
function disambiguateSelectors(groups: ManifestGroup[]): ManifestGroup[] {
  const selectorCounts = new Map<string, number>();
  const selectorIndices = new Map<string, number>();

  // Count occurrences
  for (const g of groups) {
    selectorCounts.set(g.selector, (selectorCounts.get(g.selector) ?? 0) + 1);
  }

  // Disambiguate
  return groups.map((g) => {
    const count = selectorCounts.get(g.selector) ?? 1;
    if (count <= 1) return g;

    const idx = (selectorIndices.get(g.selector) ?? 0) + 1;
    selectorIndices.set(g.selector, idx);

    // Try to make selector unique using label.
    // Prefer standard CSS selectors — avoid Playwright-specific pseudo-classes
    // like :text-is() or :has-text() since the manifest should be portable.
    // The label is already stored in ManifestGroup.label for the emitter to use.
    if (g.label && g.label !== g.selector.replace(/^[a-z]+/, "")) {
      const escapedLabel = g.label.replace(/"/g, '\\"');
      const baseTag = g.selector.split(/[.#\[]/)[0] || "*";
      return {
        ...g,
        selector: `${baseTag}[aria-label="${escapedLabel}"]`,
      };
    }

    // Fallback: nth-of-type
    return {
      ...g,
      selector: `${g.selector}:nth-of-type(${idx})`,
    };
  });
}

// ── Public API ──────────────────────────────────────────────

/**
 * Discover all groups on a live page.
 *
 * @param page       The Playwright Page to crawl.
 * @param options    Options for scoping and pass identification.
 * @returns Array of discovered ManifestGroup entries.
 */
export async function discoverGroups(
  page: Page,
  options?: { scope?: string; pass?: string },
): Promise<ManifestGroup[]> {
  const pass = options?.pass ?? "pass-1";
  const now = new Date().toISOString();

  const rawGroups = await extractRawGroups(page, options?.scope);

  const groups: ManifestGroup[] = rawGroups.map((raw) => {
    const label = resolveLabel(raw);
    const entry: ManifestGroup = {
      label,
      selector: raw.selector,
      groupType: classifyGroupType(raw),
      wrapperType: classifyWrapperType(raw),
      discoveredIn: pass,
      visibility: (raw.isVisible ? "static" : "dynamic") as Visibility,
      lastSeen: now,
    };

    // Flag date-picker fieldsets as needing an adapter (no reliable universal
    // DOM signal for date pickers — the engineer fills in the adapter manually)
    if (isDatePickerCandidate(label, raw)) {
      entry.notes = "needs-adapter";
    }

    return entry;
  });

  return disambiguateSelectors(groups);
}

/**
 * Detect toast/live-region elements on the page.
 * These use aria-live and are often outside landmark containers.
 * Pierces shadow DOM boundaries for web component apps.
 */
export async function discoverToasts(
  page: Page,
  options?: { scope?: string; pass?: string },
): Promise<ManifestGroup[]> {
  const pass = options?.pass ?? "pass-1";
  const now = new Date().toISOString();

  const toasts = await page.evaluate(
    ({ scope }: { scope: string | undefined }) => {
      /**
       * Recursively collect all elements matching `selector` from
       * a root node, piercing any shadow roots encountered.
       */
      function querySelectorAllDeep(root: ParentNode, selector: string): Element[] {
        const results: Element[] = [];
        for (const el of root.querySelectorAll(selector)) {
          results.push(el);
        }
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            results.push(...querySelectorAllDeep(el.shadowRoot, selector));
          }
        }
        return results;
      }

      const container = scope
        ? document.querySelector(scope) ?? document.body
        : document.body;

      const liveRegions = querySelectorAllDeep(
        container,
        '[aria-live="polite"], [aria-live="assertive"]',
      );

      const results: Array<{
        selector: string;
        label: string;
        isVisible: boolean;
      }> = [];

      liveRegions.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Skip live regions that are part of form controls (inline feedback)
        // We only want standalone toast/notification elements
        const role = el.getAttribute("role");
        if (
          role === "status" ||
          role === "alert" ||
          tag === "output" ||
          htmlEl.classList.contains("toast") ||
          htmlEl.classList.contains("notification") ||
          htmlEl.dataset.testid?.includes("toast")
        ) {
          const id = el.getAttribute("id");
          const ariaLabel = el.getAttribute("aria-label");
          const className = el.className;

          let selector: string;
          if (id) {
            selector = `#${CSS.escape(id)}`;
          } else if (ariaLabel) {
            selector = `[aria-label="${CSS.escape(ariaLabel)}"]`;
          } else if (className && typeof className === "string" && className.trim()) {
            const firstClass = className.trim().split(/\s+/)[0];
            selector = `${tag}.${CSS.escape(firstClass)}`;
          } else {
            selector = `${tag}[aria-live]`;
          }

          const rect = htmlEl.getBoundingClientRect();
          const style = window.getComputedStyle(htmlEl);
          const isVisible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !htmlEl.hidden &&
            (rect.width > 0 || rect.height > 0);

          results.push({
            selector,
            label: ariaLabel ?? id ?? "toast-notification",
            isVisible,
          });
        }
      });

      return results;
    },
    { scope: options?.scope },
  );

  return toasts.map((t) => ({
    label: t.label,
    selector: t.selector,
    groupType: "generic" as const,
    wrapperType: "toast" as const,
    discoveredIn: pass,
    visibility: (t.isVisible ? "static" : "dynamic") as Visibility,
    lastSeen: now,
  }));
}

export { GROUP_SELECTOR };
