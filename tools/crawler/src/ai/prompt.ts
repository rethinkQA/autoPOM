/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page using three inputs:
 *   1. DOM container summary (primary) — pruned tree of container elements
 *      with visual metadata (borders, dimensions, headings, interactivity)
 *   2. ARIA snapshot (supplementary) — semantic roles and names
 *   3. Screenshot (supplementary) — visual context
 *
 * Each container in the DOM summary has a numeric [cid]. The AI returns
 * the cid for each group so the mapper can find the exact DOM element.
 */

import type { AiPageSummary } from "./types.js";

// ── Output JSON schema (for structured output / validation) ─

/**
 * JSON schema describing the expected AI output.
 * Used by providers that support structured output (OpenAI, Anthropic).
 */
export const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    pageName: {
      type: "string" as const,
      description: "A short, lowercase, kebab-case name for this page (1-3 words). Use the page's primary purpose, e.g. 'login', 'buildings', 'device-list', 'dashboard'. Do NOT include the full URL path.",
    },
    groups: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          containerIndex: {
            type: "number" as const,
            description: "The [cid] number from the DOM summary that corresponds to this group.",
          },
          label: {
            type: "string" as const,
            description: "Short human-readable name describing what this group IS (2-5 words). Name by content/purpose: a table of products is 'Products Table', a form for login is 'Login Form', a nav with site links is 'Main Navigation'.",
          },
          groupType: {
            type: "string" as const,
            enum: [
              "nav", "header", "footer", "main", "aside", "section",
              "fieldset", "form", "region", "toolbar", "tablist",
              "menu", "menubar", "details", "generic",
            ],
            description: "Semantic type of the group.",
          },
          wrapperType: {
            type: "string" as const,
            enum: ["group", "table", "dialog", "toast", "datePicker"],
            description: "Wrapper type for code generation.",
          },
          description: {
            type: "string" as const,
            description: "One-sentence description of what this group contains or does.",
          },
          accessibilityRole: {
            type: "string" as const,
            description: "The ARIA role of the matching node (from the ARIA snapshot or role attribute in DOM summary). Empty string if no role.",
          },
          accessibilityName: {
            type: "string" as const,
            description: "The accessible name of the matching node (from aria-label, heading, or ARIA snapshot). Empty string if none.",
          },
        },
        required: ["containerIndex", "label", "groupType", "wrapperType", "description", "accessibilityRole", "accessibilityName"],
        additionalProperties: false,
      },
    },
  },
  required: ["pageName" as const, "groups" as const],
  additionalProperties: false,
};

// ── System prompt ───────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a UI analysis agent for an automated testing tool. Your job is to analyze a web page and identify every meaningful container-level section that a QA engineer would need in a page object.

## Input

You will receive three inputs:
1. **DOM Container Summary** (PRIMARY) — A pruned tree of container-level DOM elements with metadata about each: tag, id, classes, role, aria-label, dimensions, visibility, visual boundaries, heading text, and interactive child count. Each node has a numeric [cid] identifier.
2. **ARIA Snapshot** (SUPPLEMENTARY) — The accessibility tree in YAML format. Use this to get semantic roles and accessible names for nodes.
3. **Screenshot** (SUPPLEMENTARY) — Visual rendering of the page. Use this to understand layout and confirm which sections are meaningful.

## Your goal

Identify every container that a QA engineer would create a section for in a page object. These are the distinct regions of the page that group related functionality together.

## What makes a container meaningful?

Look for these signals in the DOM summary:

1. **Semantic containers**: nav, header, footer, main, aside, section, article, form, fieldset, table, dialog, details, search — these are almost always meaningful.

2. **Bordered/styled containers**: Nodes marked "bordered" (have visible border, background, or shadow) that are large enough (width > 100, height > 50) — these are card panels, sidebars, content boxes.

3. **Containers with headings**: Any node with a heading: "..." line — the developer gave it a title, so it's a named section.

4. **Containers with interactivity**: Nodes with interactive: N where N >= 2 — these hold buttons, inputs, links that form a functional area.

5. **Structural containers**: Large divs that organize the page layout — the main content area, sidebar column, toolbar row — even without borders, these are structural sections SDETs need.

Do NOT include:
- Invisible containers (marked "hidden") — unless they are dialogues or modals that could appear on interaction
- Tiny decorative containers (< 50x30)
- Pure wrapper divs that just nest a single meaningful child — pick the child instead
- Extremely deep structural nodes (depth > 5) unless they have a distinct purpose

## How to use the [cid]

Every container in the DOM summary has a [cid] number. When you identify a group, return its **containerIndex** set to that cid number. This is how we find the exact DOM element later.

Example DOM summary:
  [1] div#app (1200x900, visible)
    [2] nav#main-nav role="navigation" aria-label="Main Menu" (1200x60, visible, bordered)
      interactive: 5
    [3] div.content-area (900x800, visible)
      [4] div.filter-panel aria-label="Filters" (900x100, visible, bordered)
        heading: "Filter Products"
        interactive: 4
      [5] table#products (900x400, visible)
        heading: "Product List"
      [6] table#orders (900x300, visible)
        heading: "Recent Orders"
    [7] aside.sidebar (300x800, visible, bordered)
      heading: "Quick Actions"
      interactive: 6
    [8] footer (1200x60, visible)
      interactive: 3

From this, the groups are:
- [2] → Main Navigation (nav, group)
- [4] → Filter Panel (section, group)
- [5] → Products Table (section, table)
- [6] → Recent Orders Table (section, table)
- [7] → Quick Actions Sidebar (aside, group)
- [8] → Page Footer (footer, group)

Note: [1] and [3] are structural wrappers — skip them because they just contain other meaningful groups. But [7] is meaningful because it has its own heading + interactivity.

## Disambiguating duplicate elements

When there are MULTIPLE elements of the same type (e.g. multiple tables, multiple forms), give each a UNIQUE label based on its content:
- Look at heading text, aria-label, id, column headers
- "Products Table" vs "Orders Table" — NOT "Table 1" and "Table 2"

## ARIA snapshot correlation

Use the ARIA snapshot to find semantic roles and accessible names. If a DOM container [cid] maps to a node in the ARIA tree, copy its role and name for the accessibilityRole and accessibilityName fields. If there's no clear ARIA match, use the role attribute from the DOM summary (or empty string).

## Labeling

- containerIndex: the [cid] from the DOM summary
- label: short name (2-5 words) by content/purpose
- groupType: semantic type — one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: code generation hint — "table" for tables, "dialog" for dialogs/modals, "toast" for live regions/notifications, "datePicker" for date pickers, "group" for everything else
- description: one sentence about what the group contains/does
- accessibilityRole: ARIA role (from ARIA tree or role attribute)
- accessibilityName: accessible name (from ARIA tree, aria-label, or heading)

## Page naming

pageName should reflect the page's primary purpose in 1-3 kebab-case words (e.g. "login", "device-list", "dashboard"). Base it on the URL path and main content heading, not transient UI state.

## Naming consistency

When previously discovered pages are provided, reuse the same label for shared elements across pages. Shared elements (navigation, header, footer, sidebar) that appear on multiple pages should have GENERIC labels — "Main Navigation", "Page Header", "Page Footer" — not page-specific names. Reserve specific labels for page-unique content.

Give DISTINCT labels to different elements — never call two different things by the same name.

## Headings signal sections

Large headings (h1, h2) are strong signals that a container is a meaningful section. If the DOM summary shows a container with heading: "..." text, that section is almost certainly important. Include it. A container with an h1/h2 heading is a top-level page section; h3-h6 headings indicate subsections.

## Output

Return a JSON object with "pageName" and "groups" array.
Return ONLY the JSON object. No markdown, no explanation, no code fences.`;

// ── Message builders ────────────────────────────────────────

/**
 * Build the user message content for the AI.
 * Returns text (with DOM summary + ARIA snapshot) and the base64 screenshot.
 */
export function buildUserMessage(
  screenshot: Buffer,
  domSummary: string,
  ariaSnapshot: string,
  url: string,
  previousPages?: AiPageSummary[],
): { text: string; imageBase64: string } {
  let contextSection = "";
  if (previousPages && previousPages.length > 0) {
    const entries = previousPages.map((p) => {
      const groupList = p.groups
        .map((g) => `  - ${g.label} (${g.wrapperType})`)
        .join("\n");
      return `Page: "${p.pageName}" (URL: ${p.url})\n${groupList}`;
    });
    contextSection = `\n## Previously discovered pages\n\nThe following pages and groups have already been identified in this application. Use the same labels for shared elements (e.g. navigation, header) and distinct labels for different elements.\n\n${entries.join("\n\n")}\n`;
  }

  const text = `Analyze this web page and identify all meaningful container-level UI sections for a page object.

Page URL: ${url}
${contextSection}
## DOM Container Summary (PRIMARY — use [cid] numbers to identify groups)

${domSummary}

## ARIA Snapshot (SUPPLEMENTARY — use for semantic roles and accessible names)

${ariaSnapshot}

The screenshot provides visual context. Identify every meaningful section and return the result as a JSON object with "pageName" and "groups" array. Each group MUST include a "containerIndex" matching a [cid] from the DOM summary.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}
