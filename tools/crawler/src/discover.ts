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
 * - Sectioning elements (section, article)
 * - Form groupings (fieldset, form)
 * - Tablular data (table)
 * - Dialogs (dialog, [role="dialog"])
 * - Disclosure (details)
 * - ARIA landmarks and widgets with labels
 */
const GROUP_SELECTOR = [
  // HTML landmarks
  "nav",
  "header",
  "footer",
  "main",
  "aside",
  // Sectioning
  "section",
  "article",
  // Forms
  "fieldset",
  "form",
  // Data
  "table",
  // Overlays
  "dialog",
  // Disclosure
  "details",
  // Any element with an explicit aria-label is intentionally named → likely a group
  "[aria-label]",
  "[aria-labelledby]",
  // ARIA roles (catch divs with roles)
  "[role='navigation']",
  "[role='region']",
  "[role='group']",
  "[role='toolbar']",
  "[role='tablist']",
  "[role='menu']",
  "[role='menubar']",
  "[role='table']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='list']",
  "[role='listbox']",
  "[role='search']",
  "[role='complementary']",
  "[role='contentinfo']",
  "[role='banner']",
].join(", ");

// ── Label extraction ────────────────────────────────────────

/** Which label resolution strategy was used (P2-161). */
type LabelSource =
  | "aria-label"
  | "aria-labelledby"
  | "legend"
  | "caption"
  | "summary"
  | "heading"
  | "deep-heading"
  | "title"
  | "ancestor-aria-label"
  | "preceding-heading"
  | "text-content"
  | "id"
  | "tag";

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
  /** Nearest heading (h1-h6) that precedes this element in document flow. */
  precedingHeadingText: string | null;
  /** The element's id attribute. */
  id: string | null;
  /** Text content of <caption> child (for table). */
  captionText: string | null;
  /** CSS classes for selector building. */
  className: string;
  /** Whether the element is currently visible. */
  isVisible: boolean;
  /** A generated unique CSS selector for this element. */
  selector: string;
  /** Whether the element contains an <input type="date"> or known date-picker component. */
  containsDateInput: boolean;
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

      // Filter out nested groups: if an element is a descendant of another
      // matched element, keep only the ancestor. This prevents individual
      // form fields (e.g. [role="group"][aria-label="Email"]) from appearing
      // as separate groups when their parent card/form is already captured.
      const elementSet = new Set(elements);
      const filtered = elements.filter((el) => {
        // Skip leaf interactive elements — they matched via [aria-label] but
        // are individual controls, not group containers
        const tag = el.tagName.toLowerCase();
        const LEAF_TAGS = new Set([
          "input", "button", "select", "textarea", "a", "img", "label",
          "option", "optgroup", "progress", "meter", "output", "canvas",
          "video", "audio", "iframe", "object", "embed", "svg", "hr", "br",
          "span", "b", "i", "em", "strong", "small", "abbr", "code", "pre",
        ]);
        if (LEAF_TAGS.has(tag)) return false;

        let parent = el.parentElement;
        while (parent && parent !== container) {
          if (elementSet.has(parent)) return false; // ancestor is also a group — skip this child
          parent = parent.parentElement;
        }
        return true;
      });

      const results: RawGroupData[] = [];

      filtered.forEach((el, index) => {
        const htmlEl = el as HTMLElement;

        // Extract legend text (for fieldset)
        const legend = el.querySelector(":scope > legend");
        const legendText = legend?.textContent?.trim() ?? null;

        // Extract summary text (for details)
        const summary = el.querySelector(":scope > summary");
        const summaryText = summary?.textContent?.trim() ?? null;

        // Extract caption text (for table)
        const caption = el.querySelector(":scope > caption");
        const captionText = caption?.textContent?.trim() ?? null;

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

        // Nearest preceding heading in document flow.
        // Walk backwards through previous siblings (and up to parent
        // siblings) to find the heading that introduces this element —
        // the same way a human scans a page top-down.
        let precedingHeadingText: string | null = null;
        const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
        let cursor: Element | null = el;
        outer:
        while (cursor && cursor !== document.body) {
          let sib = cursor.previousElementSibling;
          while (sib) {
            // Check the sibling itself
            if (HEADING_TAGS.has(sib.tagName)) {
              precedingHeadingText = sib.textContent?.trim() ?? null;
              break outer;
            }
            // Check last heading inside the sibling (e.g. heading inside a div wrapper)
            const inner = sib.querySelector("h1, h2, h3, h4, h5, h6");
            if (inner) {
              // Find the LAST heading (closest to our element in flow)
              const allInner = sib.querySelectorAll("h1, h2, h3, h4, h5, h6");
              const last = allInner[allInner.length - 1];
              precedingHeadingText = last.textContent?.trim() ?? null;
              break outer;
            }
            sib = sib.previousElementSibling;
          }
          // Move up to parent and continue searching its siblings
          cursor = cursor.parentElement;
        }

        // First short text content as last-resort fallback
        // Look for the first text node or short element text.
        // Skip <style>, <script>, and <noscript> — their text content
        // is code/CSS, not human-readable labels.
        const SKIP_TAGS = new Set(["STYLE", "SCRIPT", "NOSCRIPT"]);
        let firstTextContent: string | null = null;
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          },
        );
        let textNode = walker.nextNode();
        while (textNode) {
          const txt = textNode.textContent?.trim();
          if (txt && txt.length >= 2 && txt.length <= 80) {
            firstTextContent = txt;
            break;
          }
          textNode = walker.nextNode();
        }

// Resolve aria-labelledby (may contain multiple space-separated IDs)
            const ariaLabelledBy = el.getAttribute("aria-labelledby");
            let resolvedLabelledBy: string | null = null;
            if (ariaLabelledBy) {
              const ids = ariaLabelledBy.trim().split(/\s+/);
              const resolved = ids
                .map(function(id) { return document.getElementById(id)?.textContent?.trim(); })
                .filter(Boolean)
                .join(" ");
              resolvedLabelledBy = resolved || null;
        }

        // Visibility check
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);
        const isVisible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
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
          captionText,
          headingText,
          deepHeadingText,
          titleAttr,
          nearestAncestorLabel,
          firstTextContent,
          precedingHeadingText,
          id,
          className: typeof className === "string" ? className : "",
          isVisible,
          selector,
          containsDateInput: !!(
            el.querySelector('input[type="date"]') ||
            el.querySelector('input[type="datetime-local"]') ||
            el.querySelector('[data-datepicker], [data-calendar], vue-date-picker') ||
            // P3-204: additional date-picker library selectors
            el.querySelector('.react-datepicker, .flatpickr-input, .mat-datepicker-input, [class*="datepicker"], [class*="date-picker"]')
          ),
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
  return /^[:_]r[_\d]|^_ng|^data-v-|^__vue|^\$|^:[a-z0-9]+:$|^svelte-[a-z0-9]+$|^__next|^qwik-|^astro-/i.test(id);
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
 * 9. Nearest preceding heading in document flow
 * 10. First meaningful text content in the element
 * 11. id attribute (if it looks human-authored)
 * 12. Fallback: tag name
 */
function resolveLabel(raw: RawGroupData): { label: string; source: LabelSource } {
  if (raw.ariaLabel) return { label: raw.ariaLabel, source: "aria-label" };
  if (raw.ariaLabelledBy && !isFrameworkId(raw.ariaLabelledBy)) return { label: raw.ariaLabelledBy, source: "aria-labelledby" };
  if (raw.legendText) return { label: raw.legendText, source: "legend" };
  if (raw.captionText) return { label: raw.captionText, source: "caption" };
  if (raw.summaryText) return { label: raw.summaryText, source: "summary" };
  if (raw.headingText) return { label: raw.headingText, source: "heading" };
  if (raw.deepHeadingText) return { label: raw.deepHeadingText, source: "deep-heading" };
  if (raw.titleAttr) return { label: raw.titleAttr, source: "title" };
  if (raw.nearestAncestorLabel) return { label: raw.nearestAncestorLabel, source: "ancestor-aria-label" };
  if (raw.precedingHeadingText) return { label: raw.precedingHeadingText, source: "preceding-heading" };
  if (raw.firstTextContent) return { label: raw.firstTextContent, source: "text-content" };
  if (raw.id && !isFrameworkId(raw.id)) return { label: raw.id, source: "id" };
  return { label: raw.tagName, source: "tag" };
}

// ── Type classification ─────────────────────────────────────

/** Classify the semantic group type from tag/role. */
function classifyGroupType(raw: RawGroupData): GroupType {
  const role = raw.role;
  const tag = raw.tagName;

  // Explicit ARIA roles take precedence
  if (role === "navigation") return "nav";
  if (role === "banner") return "header";
  if (role === "contentinfo") return "footer";
  if (role === "complementary") return "aside";
  if (role === "search") return "form";
  if (role === "toolbar") return "toolbar";
  if (role === "tablist") return "tablist";
  if (role === "menu") return "menu";
  if (role === "menubar") return "menubar";
  if (role === "region") return "region";
  if (role === "group") return "fieldset";
  if (role === "list" || role === "listbox") return "region";

  // Tag-based classification
  if (tag === "nav") return "nav";
  if (tag === "header") return "header";
  if (tag === "footer") return "footer";
  if (tag === "main") return "main";
  if (tag === "aside") return "aside";
  if (tag === "section") return "section";
  if (tag === "article") return "section";
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
 *
 * Requires BOTH a structural DOM signal (contains a date input or date-picker
 * component) AND a label-text heuristic, unless the element definitively
 * contains an `<input type="date">` (which alone is sufficient).
 * This avoids false positives on fieldsets that merely contain the word "date"
 * or "delivery" in their label.
 */
function isDatePickerCandidate(label: string, raw: RawGroupData): boolean {
  // Only flag fieldset/form groups, not tables or dialogs
  if (raw.tagName !== "fieldset" && raw.role !== "group") return false;

  // Strong DOM signal — definitive regardless of label
  if (raw.containsDateInput) return true;

  // Label-only heuristic: require at least two pattern matches to reduce
  // false positives (e.g. a "delivery" fieldset that isn't a date picker)
  const lower = label.toLowerCase();
  const datePatterns = [
    /\bdate\b/,
    /\bdelivery\b/,
    /\bcalendar\b/,
    /\bpick.*date\b/,
    /\bdate.*pick/,
    /\bschedul/,
  ];
  const matchCount = datePatterns.filter((p) => p.test(lower)).length;
  return matchCount >= 2;
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

  // First pass: attempt label-based disambiguation
  const result = groups.map((g) => {
    const count = selectorCounts.get(g.selector) ?? 1;
    if (count <= 1) return g;

    const idx = (selectorIndices.get(g.selector) ?? 0) + 1;
    selectorIndices.set(g.selector, idx);

    // P2-161: only use [aria-label="..."] if label actually came from aria-label
    const labelSource = (g as any)._labelSource as LabelSource | undefined;
    if (g.label && labelSource === "aria-label") {
      const baseTag = g.selector.split(/[.#[]/)[0] || "*";
      // P2-217: use CSS.escape-style quoting — replace backslash and double quotes properly
      const escapedLabel = g.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return {
        ...g,
        selector: `${baseTag}[aria-label="${escapedLabel}"]`,
      };
    }

    // For legend-sourced labels on fieldsets, use By.label pattern for emitter (P2-212)
    if (g.label && labelSource === "legend" && g.selector.startsWith("fieldset")) {
      const escapedLabel = g.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return {
        ...g,
        selector: `fieldset[aria-label="${escapedLabel}"]`,
      };
    }

    // For title-sourced labels, use [title="..."]
    if (g.label && labelSource === "title") {
      const baseTag = g.selector.split(/[.#[]/)[0] || "*";
      const escapedLabel = g.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return {
        ...g,
        selector: `${baseTag}[title="${escapedLabel}"]`,
      };
    }

    // P2-276: use document-level index instead of :nth-of-type (which requires siblings)
    return {
      ...g,
      selector: `${g.selector} >> nth=${idx - 1}`,
    };
  });

  // P2-224: second pass — detect remaining duplicates after label-based disambiguation
  // and fall back to positional indexing
  const finalCounts = new Map<string, number>();
  for (const g of result) {
    finalCounts.set(g.selector, (finalCounts.get(g.selector) ?? 0) + 1);
  }
  const finalIndices = new Map<string, number>();
  return result.map((g) => {
    const count = finalCounts.get(g.selector) ?? 1;
    if (count <= 1) return g;
    const idx = (finalIndices.get(g.selector) ?? 0) + 1;
    finalIndices.set(g.selector, idx);
    return {
      ...g,
      selector: `${g.selector} >> nth=${idx - 1}`,
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
    const { label, source: labelSource } = resolveLabel(raw);
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
      // P2-213: classify as datePicker wrapper type
      entry.wrapperType = "datePicker";
    }

    // P2-161: track label source for disambiguation
    (entry as any)._labelSource = labelSource;

    return entry;
  });

  const semanticGroups = disambiguateSelectors(groups);

  // Second pass: discover implicit groups (cards, visual containers, form groups)
  // that lack semantic HTML or ARIA roles.
  const existingSelectors = new Set(semanticGroups.map(g => g.selector));
  const implicitGroups = await discoverImplicitGroups(page, {
    scope: options?.scope,
    pass,
    existingSelectors,
  });

  return [...semanticGroups, ...implicitGroups];
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
       * Iteratively collect all elements matching `selector` from
       * a root node, piercing any shadow roots encountered.
       * Single-pass traversal (P2-130 fix).
       *
       * NOTE: This is intentionally duplicated from extractRawGroups —
       * each page.evaluate() runs in an isolated browser context that
       * cannot share closures with Node.js code.
       */
      function querySelectorAllDeep(root: ParentNode, selector: string): Element[] {
        const results: Element[] = [];
        const queue: ParentNode[] = [root];

        while (queue.length > 0) {
          const current = queue.shift()!;

          for (const el of current.querySelectorAll("*")) {
            if (el.matches(selector)) {
              results.push(el);
            }
            if (el.shadowRoot) {
              queue.push(el.shadowRoot);
            }
          }
        }

        return results;
      }

      // P2-302: warn instead of silently falling back to document.body
      let container: ParentNode = document.body;
      if (scope) {
        const scoped = document.querySelector(scope);
        if (!scoped) {
          console.warn(`[pw-crawl] scope selector "${scope}" matched nothing — returning empty results`);
          return [];
        }
        container = scoped;
      }

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

        // Filter for toast/notification live regions.
        // Include: known toast roles, common toast class patterns, and
        // elements whose tag or attributes suggest notification intent.
        const role = el.getAttribute("role");
        const isToastRole =
          role === "status" ||
          role === "alert" ||
          role === "log" ||
          tag === "output";
        const isToastClass =
          htmlEl.classList.contains("toast") ||
          htmlEl.classList.contains("notification") ||
          htmlEl.classList.contains("snackbar") ||
          htmlEl.classList.contains("flash") ||
          htmlEl.classList.contains("flash-message") ||
          htmlEl.classList.contains("alert");
        // Exclude known non-toast live regions (form validation, loading spinners)
        const isFormControl =
          htmlEl.closest("fieldset, form, [role=\"group\"], [role=\"radiogroup\"]") !== null &&
          !isToastClass;
        if ((isToastRole || isToastClass) && !isFormControl) {
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

  // P2-193: Apply disambiguation to toast results (same as discoverGroups)
  return disambiguateSelectors(toasts.map((t) => ({
    label: t.label,
    selector: t.selector,
    groupType: "generic" as const,
    wrapperType: "toast" as const,
    discoveredIn: pass,
    visibility: (t.isVisible ? "static" : "dynamic") as Visibility,
    lastSeen: now,
  })));
}

export { GROUP_SELECTOR };

// ── Implicit group discovery (framework-agnostic) ───────────

/**
 * Heuristic data collected for each candidate implicit group.
 * Gathered inside page.evaluate() in a single browser round-trip.
 */
interface ImplicitGroupCandidate {
  /** How this candidate was detected. */
  reason: "repeated-siblings" | "visual-card" | "interactive-container";
  /** CSS selector for the container element. */
  selector: string;
  /** Lowercased tag name. */
  tagName: string;
  /** Best label found (heading, aria-label, class-based, etc.) */
  label: string;
  /** Whether the element is visible. */
  isVisible: boolean;
  /** Number of repeated children (for repeated-siblings). */
  childCount?: number;
}

/**
 * Discover implicit groups that lack semantic HTML or ARIA roles.
 *
 * Runs three heuristics inside a single page.evaluate():
 * 1. **Repeated siblings** — a parent with 3+ structurally identical children
 *    is a list/card container.
 * 2. **Visual cards** — elements with distinct background, border, or shadow
 *    compared to their parent.
 * 3. **Interactive containers** — non-semantic containers holding 2+ form controls.
 *
 * Results are deduplicated against the semantic groups already discovered
 * by discoverGroups() so there is no double-counting.
 */
export async function discoverImplicitGroups(
  page: Page,
  options?: { scope?: string; pass?: string; existingSelectors?: Set<string> },
): Promise<ManifestGroup[]> {
  const pass = options?.pass ?? "pass-1";
  const now = new Date().toISOString();
  const existingSelectors = options?.existingSelectors ?? new Set<string>();

  const candidates: ImplicitGroupCandidate[] = await page.evaluate(
    ({ scope, groupSel }: { scope: string | undefined; groupSel: string }) => {
      const container = scope
        ? document.querySelector(scope) ?? document.body
        : document.body;

      const results: ImplicitGroupCandidate[] = [];
      const seen = new Set<Element>();

      // ── Helper: build a selector for an element ────────────
      function buildSelector(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id) return `#${CSS.escape(id)}`;
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
        const cls = el.className;
        if (cls && typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          return `${tag}.${CSS.escape(first)}`;
        }
        return tag;
      }

      // ── Helper: find best label for a container ────────────
      function findLabel(el: Element): string {
        // aria-label
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel;
        // Direct heading child
        const heading = el.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
        if (heading?.textContent?.trim()) return heading.textContent.trim();
        // aria-labelledby
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const ref = document.getElementById(labelledBy);
          if (ref?.textContent?.trim()) return ref.textContent.trim();
        }
        // Class-based label: extract meaningful word from class name
        const cls = el.className;
        if (cls && typeof cls === "string") {
          // Try to find a semantic class (card, panel, section, etc.)
          const classes = cls.trim().split(/\s+/);
          for (const c of classes) {
            // Strip framework prefixes and extract meaningful part
            const clean = c.replace(/^(mui|ant|chakra|el|v-|mat-)/, "")
                           .replace(/[-_]/g, " ").trim();
            if (clean.length > 2 && clean.length < 40 && !/^[a-f0-9]{6,}$/i.test(clean)) {
              return clean;
            }
          }
        }
        // Tag name fallback
        return el.tagName.toLowerCase();
      }

      // ── Helper: structural hash of an element (tag + child tags) ──
      function structureHash(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const childTags = Array.from(el.children)
          .map(c => c.tagName.toLowerCase())
          .join(",");
        return `${tag}:${childTags}`;
      }

      // ── 1. Repeated sibling detection ─────────────────────
      // Walk through the DOM looking for parents whose children share
      // the same structural shape. Minimum 3 identical siblings.
      function findRepeatedSiblings(root: Element) {
        const children = Array.from(root.children).filter(c => {
          // Skip invisible children
          const style = window.getComputedStyle(c as HTMLElement);
          return style.display !== "none" && style.visibility !== "hidden";
        });

        if (children.length < 3) return;

        // Compute structural hashes
        const hashes = children.map(c => structureHash(c));

        // Count each hash
        const hashCounts = new Map<string, number>();
        for (const h of hashes) {
          hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
        }

        // Find the dominant hash (most common child structure)
        let bestHash = "";
        let bestCount = 0;
        for (const [h, count] of hashCounts) {
          if (count > bestCount) {
            bestHash = h;
            bestCount = count;
          }
        }

        // If 3+ children share the same structure, this is a list container
        if (bestCount >= 3 && !seen.has(root) && !root.matches(groupSel)) {
          seen.add(root);
          results.push({
            reason: "repeated-siblings",
            selector: buildSelector(root),
            tagName: root.tagName.toLowerCase(),
            label: findLabel(root),
            isVisible: true,
            childCount: bestCount,
          });
        }

        // Recurse into children
        for (const child of children) {
          findRepeatedSiblings(child);
        }
      }

      // ── 2. Visual card detection ──────────────────────────
      // Elements with distinct background/border/shadow from their parent.
      function findVisualCards(root: Element, depth: number) {
        if (depth > 8) return; // Don't traverse too deep

        const children = Array.from(root.children);
        for (const child of children) {
          if (seen.has(child) || child.matches(groupSel)) {
            findVisualCards(child, depth + 1);
            continue;
          }

          const htmlChild = child as HTMLElement;
          const style = window.getComputedStyle(htmlChild);
          if (style.display === "none" || style.visibility === "hidden") continue;

          const parentStyle = window.getComputedStyle(root as HTMLElement);

          // Check for visual boundary signals
          const hasBorder = style.borderWidth !== "0px" &&
                           style.borderStyle !== "none" &&
                           style.borderColor !== parentStyle.borderColor;
          const hasShadow = style.boxShadow !== "none" && style.boxShadow !== "";
          const hasDistinctBg = style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                                style.backgroundColor !== "transparent" &&
                                style.backgroundColor !== parentStyle.backgroundColor;
          const hasRadius = style.borderRadius !== "0px" && style.borderRadius !== "";

          // Need at least 1 visual signal to be a candidate
          // (AI curation handles filtering out noise)
          const visualSignals = [hasBorder, hasShadow, hasDistinctBg, hasRadius]
            .filter(Boolean).length;

          // Also check it has meaningful content (not just a wrapper)
          const hasContent = child.children.length >= 2 ||
                            child.querySelector("img, h1, h2, h3, h4, h5, h6, p, button, a, input");

          if (visualSignals >= 1 && hasContent && !seen.has(child)) {
            seen.add(child);
            results.push({
              reason: "visual-card",
              selector: buildSelector(child),
              tagName: child.tagName.toLowerCase(),
              label: findLabel(child),
              isVisible: true,
            });
          }

          findVisualCards(child, depth + 1);
        }
      }

      // ── 3. Interactive container detection ────────────────
      // Non-semantic containers with 2+ form controls inside.
      const INTERACTIVE_SELECTOR = "input, button, select, textarea, " +
        '[role="button"], [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"]';

      function findInteractiveContainers(root: Element, depth: number) {
        if (depth > 8) return;

        const children = Array.from(root.children);
        for (const child of children) {
          if (seen.has(child) || child.matches(groupSel)) {
            findInteractiveContainers(child, depth + 1);
            continue;
          }

          const tag = child.tagName.toLowerCase();
          // Skip elements already matched by GROUP_SELECTOR
          if (["form", "fieldset", "nav", "header", "footer", "main", "aside",
               "table", "dialog", "details"].includes(tag)) {
            findInteractiveContainers(child, depth + 1);
            continue;
          }

          const interactiveChildren = child.querySelectorAll(INTERACTIVE_SELECTOR);
          if (interactiveChildren.length >= 2 && !seen.has(child)) {
            seen.add(child);
            results.push({
              reason: "interactive-container",
              selector: buildSelector(child),
              tagName: tag,
              label: findLabel(child),
              isVisible: true,
            });
          } else {
            findInteractiveContainers(child, depth + 1);
          }
        }
      }

      // ── 4. Headed container detection ─────────────────────
      // Non-semantic containers (div, etc.) with a direct heading child.
      // These are visually obvious sections that a human would identify.
      // Heading selectors: direct child OR one level nested (common pattern: div > div > h2)
      const DIRECT_HEADING = ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6";
      const NEAR_HEADING = "h1, h2, h3, h4, h5, h6";

      function findNearHeading(el: Element): Element | null {
        // Check direct children first
        const direct = el.querySelector(DIRECT_HEADING);
        if (direct) return direct;
        // Check one level deeper (div > div > h2 pattern)
        for (const child of Array.from(el.children)) {
          const nested = child.querySelector(DIRECT_HEADING);
          if (nested) return nested;
        }
        return null;
      }

      function findHeadedContainers(root: Element, depth: number) {
        if (depth > 8) return;

        const children = Array.from(root.children);
        for (const child of children) {
          if (seen.has(child) || child.matches(groupSel)) {
            findHeadedContainers(child, depth + 1);
            continue;
          }

          const tag = child.tagName.toLowerCase();
          // Skip elements already matched by GROUP_SELECTOR or semantic tags
          if (["section", "article", "form", "fieldset", "nav", "header", "footer",
               "main", "aside", "table", "dialog", "details"].includes(tag)) {
            findHeadedContainers(child, depth + 1);
            continue;
          }

          const htmlChild = child as HTMLElement;
          const style = window.getComputedStyle(htmlChild);
          if (style.display === "none" || style.visibility === "hidden") continue;

          // Find a heading within 2 levels of nesting
          const heading = findNearHeading(child);
          if (!heading?.textContent?.trim()) {
            findHeadedContainers(child, depth + 1);
            continue;
          }

          // Must have meaningful content beyond just the heading
          const hasContent = child.children.length >= 2 ||
                            child.querySelector("p, table, ul, ol, img, button, a, input, form");
          if (hasContent && !seen.has(child)) {
            seen.add(child);
            results.push({
              reason: "visual-card" as const,
              selector: buildSelector(child),
              tagName: tag,
              label: heading.textContent!.trim(),
              isVisible: true,
            });
          } else {
            findHeadedContainers(child, depth + 1);
          }
        }
      }

      // Run all four heuristics
      findRepeatedSiblings(container);
      findVisualCards(container, 0);
      findInteractiveContainers(container, 0);
      findHeadedContainers(container, 0);

      return results;
    },
    { scope: options?.scope, groupSel: GROUP_SELECTOR },
  );

  // Convert candidates to ManifestGroup entries, deduplicating against existing groups
  const groups: ManifestGroup[] = [];
  const seenSelectors = new Set<string>(existingSelectors);

  for (const c of candidates) {
    if (seenSelectors.has(c.selector)) continue;
    seenSelectors.add(c.selector);

    groups.push({
      label: c.label,
      selector: c.selector,
      groupType: c.reason === "interactive-container" ? "form" : "section",
      wrapperType: "group",
      discoveredIn: pass,
      visibility: (c.isVisible ? "static" : "dynamic") as Visibility,
      lastSeen: now,
      ...(c.reason === "repeated-siblings" && c.childCount
        ? { notes: `list-container (${c.childCount} items)` }
        : {}),
    });
  }

  return disambiguateSelectors(groups);
}
