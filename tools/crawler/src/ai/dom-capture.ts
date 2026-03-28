/**
 * DOM container capture — extracts a pruned DOM tree of container-level
 * elements with structural and visual metadata.
 *
 * Runs inside the browser via page.evaluate(). Walks the DOM, identifies
 * elements that look like "containers" (have children, have visual
 * boundaries, hold headings, etc.), and builds a compact summary tree.
 *
 * Each container gets a temporary `data-pw-cid` attribute (cleaned up
 * after the AI responds) so the mapper can find the exact element later.
 */

import type { Page } from "playwright";

// ── Types for the captured DOM tree ─────────────────────────

export interface CapturedContainer {
  /** Sequential ID assigned during capture (matches data-pw-cid). */
  cid: number;
  /** HTML tag name (lowercase). */
  tag: string;
  /** Element id attribute (empty if none). */
  id: string;
  /** First 3 CSS classes. */
  classes: string[];
  /** Explicit role attribute (empty if none). */
  role: string;
  /** aria-label or resolved aria-labelledby text. */
  ariaLabel: string;
  /** title attribute. */
  title: string;
  /** Bounding box width. */
  width: number;
  /** Bounding box height. */
  height: number;
  /** Whether the element is currently visible (display, visibility, opacity, dimensions). */
  isVisible: boolean;
  /** Whether the element has a visual boundary (border, background, box-shadow). */
  hasVisualBoundary: boolean;
  /** Text content of the first h1-h6 child (empty string if none). */
  headingText: string;
  /** Number of interactive children (buttons, inputs, links, selects). */
  interactiveCount: number;
  /** Number of direct text content characters (capped). */
  textPreview: string;
  /** Nesting depth from body. */
  depth: number;
  /** Child containers. */
  children: CapturedContainer[];
}

// ── Browser-side capture function ───────────────────────────

/**
 * Capture the DOM container tree from a live page.
 *
 * Assigns temporary `data-pw-cid` attributes to each container node
 * so the mapper can locate them later. Call `cleanupCapture(page)`
 * after processing to remove them.
 */
export async function captureDomTree(page: Page): Promise<CapturedContainer[]> {
  return page.evaluate(() => {
    let nextCid = 1;

    // Semantic container tags — always considered containers
    const SEMANTIC_CONTAINERS = new Set([
      "nav", "main", "header", "footer", "aside", "section",
      "article", "form", "fieldset", "table", "dialog", "details",
      "figure", "search", "menu",
    ]);

    // Leaf tags — never containers
    const LEAF_TAGS = new Set([
      "a", "button", "input", "select", "textarea", "option",
      "img", "svg", "canvas", "video", "audio", "iframe",
      "label", "span", "strong", "em", "b", "i", "u", "small",
      "sub", "sup", "abbr", "code", "pre", "br", "hr", "wbr",
      "th", "td", "caption", "col", "colgroup",
    ]);

    function isVisible(el: HTMLElement): boolean {
      const style = getComputedStyle(el);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    }

    function hasVisualBoundary(el: HTMLElement): boolean {
      const style = getComputedStyle(el);

      // Check border
      const bw = parseFloat(style.borderWidth || "0");
      if (bw > 0 && style.borderStyle !== "none") return true;

      // Check background (not transparent)
      const bg = style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;

      // Check box-shadow
      if (style.boxShadow && style.boxShadow !== "none") return true;

      // Check outline (some frameworks use outline for card boundaries)
      const ow = parseFloat(style.outlineWidth || "0");
      if (ow > 0 && style.outlineStyle !== "none") return true;

      return false;
    }

    function getHeadingText(el: HTMLElement): string {
      const heading = el.querySelector("h1, h2, h3, h4, h5, h6");
      if (!heading) return "";
      return (heading.textContent || "").trim().slice(0, 80);
    }

    function getInteractiveCount(el: HTMLElement): number {
      return el.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab']"
      ).length;
    }

    function getAriaLabel(el: HTMLElement): string {
      const label = el.getAttribute("aria-label");
      if (label) return label.trim();

      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map(id => {
          const ref = document.getElementById(id);
          return ref ? (ref.textContent || "").trim() : "";
        }).filter(Boolean);
        if (parts.length > 0) return parts.join(" ");
      }

      return "";
    }

    function getTextPreview(el: HTMLElement): string {
      // Get direct text content (not from children), capped
      let text = "";
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += (node.textContent || "").trim() + " ";
        }
      }
      return text.trim().slice(0, 60);
    }

    function isContainer(el: HTMLElement): boolean {
      const tag = el.tagName.toLowerCase();

      // Always a container if semantic
      if (SEMANTIC_CONTAINERS.has(tag)) return true;

      // Never a container if leaf
      if (LEAF_TAGS.has(tag)) return false;

      // Custom elements (web components: tags with hyphens like <app-sidebar>)
      if (tag.includes("-")) return true;

      // Definition lists — common for key-value detail sections
      if (tag === "dl") return true;

      // Has explicit role that indicates a container
      const role = el.getAttribute("role") || "";
      const containerRoles = new Set([
        "navigation", "main", "banner", "contentinfo", "complementary",
        "region", "form", "table", "grid", "treegrid", "dialog",
        "alertdialog", "toolbar", "tablist", "tabpanel", "menu",
        "menubar", "group", "radiogroup", "listbox", "tree",
        "feed", "log", "status", "alert", "search", "application",
      ]);
      if (containerRoles.has(role)) return true;

      // Developer-marked test targets — always meaningful
      if (el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-cy")) return true;

      // Any element with an h1 or h2 child is almost certainly a major section
      if (el.querySelector(":scope > h1, :scope > h2") ||
          el.querySelector(":scope > * > h1, :scope > * > h2")) return true;

      // Div/span/li/ul/ol with meaningful signals
      if (tag === "div" || tag === "span" || tag === "li" || tag === "ul" || tag === "ol") {
        // Has an id, aria-label, aria-labelledby, or role
        if (el.id || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || role) return true;

        // Has a heading child (h3-h6, direct or one level deep)
        if (el.querySelector(":scope > h3, :scope > h4, :scope > h5, :scope > h6")) return true;
        if (el.querySelector(":scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6")) return true;

        // Has visual boundary + any children
        const childElements = el.children.length;
        if (childElements >= 1 && hasVisualBoundary(el)) return true;

        // Has interactive children (lowered from 3 to 2)
        const interactive = getInteractiveCount(el);
        if (interactive >= 2) return true;

        // Large enough and has child elements
        const rect = el.getBoundingClientRect();
        if (rect.width > 150 && rect.height > 80 && childElements >= 2) return true;

        // Direct child of body/main with reasonable size — structural layout section
        const parentTag = el.parentElement?.tagName.toLowerCase();
        if ((parentTag === "body" || parentTag === "main") && rect.width > 200 && rect.height > 50) return true;
      }

      // ul/ol with significant content
      if (tag === "ul" || tag === "ol") {
        const items = el.querySelectorAll(":scope > li");
        if (items.length >= 2) return true;
      }

      return false;
    }

    function walkNode(el: HTMLElement, depth: number): CapturedContainer | null {
      // Max depth to prevent explosion
      if (depth > 8) return null;

      const isThisContainer = isContainer(el);

      // Always walk children — even non-containers may wrap important
      // descendants (e.g. a plain div wrapping a table).
      const children: CapturedContainer[] = [];
      for (const child of el.children) {
        if (child instanceof HTMLElement) {
          const result = walkNode(child, depth + (isThisContainer ? 1 : 0));
          if (result) {
            if ((result as any).__orphans) {
              // Non-container returned orphaned children — adopt them
              children.push(...(result as any).__orphans);
            } else {
              children.push(result as CapturedContainer);
            }
          }
        }
      }

      // If this element is not a container, bubble its children up
      if (!isThisContainer) {
        // Return children as "orphans" — the caller collects them
        return children.length > 0 ? ({ __orphans: children } as any) : null;
      }

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();

      // Assign CID
      const cid = nextCid++;
      el.setAttribute("data-pw-cid", String(cid));

      return {
        cid,
        tag,
        id: el.id || "",
        classes: (el.className && typeof el.className === "string")
          ? el.className.trim().split(/\s+/).slice(0, 3)
          : [],
        role: el.getAttribute("role") || "",
        ariaLabel: getAriaLabel(el),
        title: (el.getAttribute("title") || "").trim().slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        isVisible: isVisible(el),
        hasVisualBoundary: hasVisualBoundary(el),
        headingText: getHeadingText(el),
        interactiveCount: getInteractiveCount(el),
        textPreview: getTextPreview(el),
        depth,
        children,
      };
    }

    // Start from body's children — walk everything, capture containers
    const roots: CapturedContainer[] = [];
    for (const child of document.body.children) {
      if (child instanceof HTMLElement) {
        const result = walkNode(child, 0);
        if (result) {
          if ((result as any).__orphans) {
            roots.push(...(result as any).__orphans);
          } else {
            roots.push(result as CapturedContainer);
          }
        }
      }
    }

    return roots;
  });
}

// ── Cleanup ─────────────────────────────────────────────────

/**
 * Remove all `data-pw-cid` attributes from the page.
 * Call this after the AI has responded and groups have been mapped.
 */
export async function cleanupCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const els = document.querySelectorAll("[data-pw-cid]");
    for (const el of els) {
      el.removeAttribute("data-pw-cid");
    }
  });
}

// ── Format as text for the AI prompt ────────────────────────

/**
 * Format the captured container tree as a readable indented text summary
 * for inclusion in the AI prompt.
 */
export function formatDomSummary(containers: CapturedContainer[]): string {
  const lines: string[] = [];

  function formatNode(node: CapturedContainer, indent: number): void {
    const pad = "  ".repeat(indent);

    // Build the main line: [cid] tag#id.class role="X" aria-label="Y" (WxH, visible/hidden, bordered)
    let line = `${pad}[${node.cid}] ${node.tag}`;
    if (node.id) line += `#${node.id}`;
    if (node.classes.length > 0) line += `.${node.classes.join(".")}`;
    if (node.role) line += ` role="${node.role}"`;
    if (node.ariaLabel) line += ` aria-label="${node.ariaLabel}"`;

    const flags: string[] = [];
    flags.push(`${node.width}x${node.height}`);
    flags.push(node.isVisible ? "visible" : "hidden");
    if (node.hasVisualBoundary) flags.push("bordered");
    line += ` (${flags.join(", ")})`;

    lines.push(line);

    // Add content hints on the next line
    const hints: string[] = [];
    if (node.headingText) hints.push(`heading: "${node.headingText}"`);
    if (node.interactiveCount > 0) hints.push(`interactive: ${node.interactiveCount}`);
    if (node.title) hints.push(`title: "${node.title}"`);
    if (node.textPreview) hints.push(`text: "${node.textPreview}"`);
    if (hints.length > 0) {
      lines.push(`${pad}  ${hints.join(", ")}`);
    }

    // Recurse into children
    for (const child of node.children) {
      formatNode(child, indent + 1);
    }
  }

  for (const root of containers) {
    formatNode(root, 0);
  }

  return lines.join("\n");
}
