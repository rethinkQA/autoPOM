/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page's accessibility tree
 * (ARIA snapshot) and return container-level groups matching our
 * manifest schema. The ARIA tree is the primary input; the screenshot
 * provides supplementary visual context.
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
            description: "The ARIA role of the matching node in the accessibility tree.",
          },
          accessibilityName: {
            type: "string" as const,
            description: "The accessible name of the matching node in the accessibility tree.",
          },
        },
        required: ["label", "groupType", "wrapperType", "description", "accessibilityRole", "accessibilityName"],
        additionalProperties: false,
      },
    },
  },
  required: ["pageName" as const, "groups" as const],
  additionalProperties: false,
};

// ── System prompt ───────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a UI analysis agent for an automated testing tool. Your job is to analyze a web page and identify the meaningful container-level groups that a QA engineer would need in a page object.

## Input

You will receive:
1. An ARIA snapshot in YAML format — the accessibility tree of the page
2. A screenshot — use to determine what is ACTUALLY VISIBLE on the page right now

## Your goal

Identify every meaningful, VISIBLE container-level region on the page. Think like a QA engineer describing the page: "There's a navigation bar at the top, a product table in the middle, a filter form above it, and a footer at the bottom." Each group is a self-contained region that serves a single purpose.

## CRITICAL: Only include VISIBLE elements

The ARIA tree may contain elements that exist in the DOM but are NOT currently visible (hidden modals, collapsed accordions, off-screen SPA routes, lazy-loaded panels). You MUST cross-reference with the screenshot.

- If an element appears in the ARIA tree but NOT in the screenshot, DO NOT include it.
- Exception: navigation menus that are visible but may not be obvious in screenshots (e.g. sticky headers) — include these.
- Exception: footers that may be below the fold but are standard page structure — include these.
- When in doubt, check the screenshot. If you can't see it, don't include it.

## How to read the ARIA tree

The ARIA snapshot is a YAML tree. Each line is a node with a role and (optionally) a name in quotes. Indentation shows parent-child relationships. Example:

  - navigation "Main Menu":
    - link "Home"
    - link "Products"
  - main:
    - heading "Products" [level=1]
    - table "Product List":
      - rowgroup:
        - row "header":
          - columnheader "Name"
          - columnheader "Price"
    - region "Filters":
      - textbox "Search"
      - button "Apply"
  - contentinfo:
    - link "Privacy"

From this tree, the groups are:
- navigation "Main Menu" → Main Navigation
- table "Product List" → Products Table
- region "Filters" → Search Filters
- contentinfo → Page Footer

## Rules for picking groups

1. **Pick CONTAINER-level nodes.** These hold children that form a region: navigation, main, banner, contentinfo, complementary, region, table, form, group (for fieldsets), dialog, toolbar, tablist, menu, menubar, search, list (when it represents a section), article.

2. **Do NOT pick leaf elements.** Individual links, buttons, textboxes, checkboxes, headings, cells, rows, listitem — these are CHILDREN of groups, not groups themselves.

3. **Pick the right level.** If a region just wraps a single table, pick the table. If a region contains multiple distinct subsections, pick the region. If both serve different purposes, pick both.

4. **accessibilityRole and accessibilityName must match the ARIA tree EXACTLY.** Copy the role name and the quoted name string from the YAML as-is. If a node has no quoted name, use an empty string for accessibilityName.

5. **Be thorough.** Every visible region a QA engineer might want to test should appear. Navigation, main content, sidebars, forms, tables, toolbars, tab panels, card lists, footers — all count. A typical page has 4-15 groups.

6. **Named generic containers ARE meaningful.** If a node has role "generic" but has a name (e.g. generic "Sidebar"), it IS a meaningful section — include it. Only skip UNNAMED generic/group nodes that are pure structural wrappers with no distinct purpose.

7. **Look for sections with headings.** If a container holds a heading followed by content (e.g. a group containing heading "Recent Activity" + list), that container is likely a meaningful section. Include it.

8. **Look for sections the screenshot reveals.** If the screenshot shows a distinct visual region (card grid, sidebar panel, statistics bar, action toolbar) that the ARIA tree represents as a generic container or a group — include it. Use the screenshot to catch sections that lack ARIA landmarks.

## Disambiguating duplicate elements

When there are MULTIPLE elements of the same type (e.g. multiple tables, multiple forms, multiple navigation menus), you MUST give each one a UNIQUE label that describes its specific content:

- Two tables → "Products Table" and "Orders Table" (NOT "Table 1" and "Table 2")
- Two forms → "Login Form" and "Search Form" (NOT "Form" and "Form")
- Two nav menus → "Main Navigation" and "User Menu"

Look at each element's children (column headers, form labels, links) to determine what makes it unique.

## Labeling

- label: Short name for the group (2-5 words). Name by content/purpose:
  - Table of products → "Products Table"
  - Navigation with site links → "Main Navigation"
  - Form for logging in → "Login Form"
  - Footer with copyright → "Page Footer"
- groupType: semantic type — one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: code generation hint — one of [group, table, dialog, toast, datePicker]
  - Use "table" for tables, "dialog" for dialogs/modals, "toast" for live regions/notifications, "datePicker" for date pickers, "group" for everything else
- description: one sentence about what the group contains/does
- accessibilityRole: the EXACT role from the ARIA tree node
- accessibilityName: the EXACT quoted name from the ARIA tree node (empty string if none)

## Page naming

pageName should reflect the page's primary purpose in 1-3 kebab-case words (e.g. "login", "device-list", "dashboard"). Do NOT vary the name based on transient state — a page with a modal open is still the same page. Use the URL path and main content heading to determine the name, not the current UI state.

## Naming consistency

When previously discovered pages are provided, reuse the same label for shared elements (e.g. navigation, header) across pages. Give DISTINCT labels to different elements — never call two different things by the same name.

## Output

Return a JSON object with "pageName" (short kebab-case, 1-3 words based on page purpose) and "groups" array.
Return ONLY the JSON object. No markdown, no explanation, no code fences.`;

// ── Message builders ────────────────────────────────────────

/**
 * Build the user message content for the AI.
 * Returns text (with embedded ARIA snapshot) and the base64 screenshot.
 */
export function buildUserMessage(
  screenshot: Buffer,
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

  const text = `Analyze this web page's accessibility tree and identify all container-level UI groups.

Page URL: ${url}
${contextSection}
## ARIA Snapshot (YAML) — this is the complete accessibility tree

${ariaSnapshot}

Use the ARIA tree above as your primary source. The screenshot provides visual context. Identify every meaningful container-level group and return the result as a JSON object with a "groups" array.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}
