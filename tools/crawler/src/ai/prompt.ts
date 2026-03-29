/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page using three inputs:
 *   1. Cleaned DOM HTML (primary) — full page structure with data-pw-cid
 *      attributes on block-level elements
 *   2. ARIA snapshot (supplementary) — semantic roles and names
 *   3. Screenshot (supplementary) — visual context
 *
 * Each block-level element in the cleaned DOM has a data-pw-cid attribute.
 * The AI returns the cid for each group so the mapper can find the exact
 * DOM element.
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
            description: "The data-pw-cid value from the cleaned DOM HTML that corresponds to this group's wrapper element.",
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
1. **Cleaned DOM HTML** (PRIMARY) — The full page DOM structure as simplified HTML. Every block-level element has a \`data-pw-cid\` attribute with a unique numeric ID. Text content is truncated. Repetitive siblings (e.g. table rows, list items) are collapsed with "<!-- …N more <tag> -->" comments. Invisible (display:none) elements are already filtered out.
2. **ARIA Snapshot** (SUPPLEMENTARY) — The accessibility tree in YAML format. Use this to get semantic roles and accessible names for nodes.
3. **Screenshot** (SUPPLEMENTARY) — Visual rendering of the page. Use this to understand layout and confirm which sections are visually meaningful.

## Your goal

Identify every container that a QA engineer would create a section for in a page object. These are the distinct regions of the page that group related functionality together.

## What makes a container meaningful?

Look for these signals in the DOM:

1. **Semantic HTML elements**: \`<nav>\`, \`<header>\`, \`<footer>\`, \`<main>\`, \`<aside>\`, \`<section>\`, \`<article>\`, \`<form>\`, \`<fieldset>\`, \`<table>\`, \`<dialog>\`, \`<details>\`, \`<search>\`, \`<menu>\` — these are almost always meaningful sections.

2. **Headings inside containers**: Any element that contains an \`<h1>\`–\`<h6>\` is very likely a named section. Large headings (\`<h1>\`, \`<h2>\`) signal top-level page sections. Pay close attention to these.

3. **Containers with interactive elements**: Elements containing multiple \`<button>\`, \`<input>\`, \`<a>\`, \`<select>\`, \`<textarea>\` — these form functional areas (forms, toolbars, navigation).

4. **ARIA landmarks and roles**: Elements with \`role="navigation"\`, \`role="region"\`, \`role="complementary"\`, \`role="toolbar"\`, \`role="tablist"\`, \`role="dialog"\`, \`role="group"\`, etc. — explicit developer intent.

5. **Named containers**: Elements with \`id\`, \`aria-label\`, or \`aria-labelledby\` attributes — the developer gave them an identity, so they're meaningful.

6. **Structural layout sections**: Top-level \`<div>\` elements that organize the page into visual regions (sidebar, content area, toolbar row) — even without semantic tags, these are sections SDETs need.

7. **Tables**: Every \`<table>\` is a section. Look at column headers (\`<th>\`) and surrounding headings to give each table a unique, descriptive label.

Do NOT include:
- Pure wrapper divs that only nest a single meaningful child — pick the child instead
- Extremely deep structural nodes that don't represent a distinct section
- Decorative containers with no functional content

## Using data-pw-cid

Every block-level element in the cleaned DOM has a \`data-pw-cid="N"\` attribute. When you identify a group, set \`containerIndex\` to that element's cid number. This is how we find the exact DOM element later.

Pick the **most specific** element that wraps the group. For example, if a \`<form>\` contains inputs and buttons, pick the \`<form>\`'s cid, not a parent \`<div>\`'s cid.

## Example

Given this cleaned DOM:
\`\`\`html
<div data-pw-cid="1" id="app">
  <nav data-pw-cid="2" role="navigation" aria-label="Main Menu">
    <a href="/">Home</a>
    <a href="/products">Products</a>
    <a href="/orders">Orders</a>
  </nav>
  <div data-pw-cid="3" class="content">
    <div data-pw-cid="4" class="filter-bar">
      <h2>Filter Products</h2>
      <input type="text" placeholder="Search…"/>
      <select name="category"><option>All</option></select>
      <button>Apply</button>
    </div>
    <table data-pw-cid="5" id="products">
      <thead data-pw-cid="6">
        <tr data-pw-cid="7"><th>Name</th><th>Price</th><th>Stock</th></tr>
      </thead>
      <tbody data-pw-cid="8">
        <tr data-pw-cid="9"><td>Widget A</td><td>$10</td><td>42</td></tr>
        <tr data-pw-cid="10"><td>Widget B</td><td>$20</td><td>17</td></tr>
        <!-- …48 more <tr> -->
      </tbody>
    </table>
    <table data-pw-cid="11" id="recent-orders">
      <thead data-pw-cid="12">
        <tr data-pw-cid="13"><th>Order #</th><th>Date</th><th>Status</th></tr>
      </thead>
      <tbody data-pw-cid="14">
        <tr data-pw-cid="15"><td>#1001</td><td>2024-01-15</td><td>Shipped</td></tr>
        <!-- …9 more <tr> -->
      </tbody>
    </table>
  </div>
  <aside data-pw-cid="16" class="sidebar">
    <h2>Quick Actions</h2>
    <button>New Product</button>
    <button>Export CSV</button>
    <button>Settings</button>
  </aside>
  <footer data-pw-cid="17">
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </footer>
</div>
\`\`\`

The groups would be:
- containerIndex: 2 → "Main Navigation" (nav, group)
- containerIndex: 4 → "Filter Panel" (section, group) — has heading + interactive elements
- containerIndex: 5 → "Products Table" (section, table) — named by heading/id
- containerIndex: 11 → "Recent Orders Table" (section, table) — named by id
- containerIndex: 16 → "Quick Actions Sidebar" (aside, group) — has heading + buttons
- containerIndex: 17 → "Page Footer" (footer, group)

Note: cid 1 and 3 are structural wrappers — skip them. cid 5 is the \`<table>\` (not its \`<thead>\` or \`<tbody>\`).

## Disambiguating duplicate elements

When there are MULTIPLE elements of the same type (e.g. multiple tables, multiple forms), give each a UNIQUE label based on its content:
- Look at heading text, aria-label, id, column headers (\`<th>\`)
- "Products Table" vs "Recent Orders Table" — NOT "Table 1" and "Table 2"

## ARIA snapshot correlation

Use the ARIA snapshot to find semantic roles and accessible names. If a DOM element maps to a node in the ARIA tree, use its role and name for the accessibilityRole and accessibilityName fields. If there's no clear ARIA match, use the role attribute from the DOM (or empty string).

## Labeling

- containerIndex: the data-pw-cid value from the DOM
- label: short name (2-5 words) by content/purpose
- groupType: semantic type — one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: code generation hint — "table" for tables/grids, "dialog" for dialogs/modals, "toast" for live regions/notifications, "datePicker" for date pickers, "group" for everything else
- description: one sentence about what the group contains/does
- accessibilityRole: ARIA role (from ARIA tree or role attribute)
- accessibilityName: accessible name (from ARIA tree, aria-label, or heading)

## Page naming and URL mutations

The URL you receive may include query parameters (\`?tab=info&sort=name\`) and hash fragments (\`#details\`). These represent **page state**, not different pages.

- **pageName** should reflect the page's primary purpose in 1-3 kebab-case words (e.g. "login", "device-list", "dashboard")
- Base the name on the **base URL path** — ignore query params, hash fragments, and dynamic IDs
- Examples:
  - \`/buildings?tab=details&view=map\` → "buildings"
  - \`/devices/123/edit\` → "device-edit"
  - \`/admin/users?sort=name&page=2\` → "admin-users"
  - \`/#/settings/profile\` → "settings-profile"

A single "page" may be visited with different URL mutations (tabs, filters, sorts, pagination). Your analysis should capture the sections visible in the CURRENT state — other states may be scanned separately and merged later.

## Naming consistency

When previously discovered pages are provided, reuse the same label for shared elements across pages. Shared elements (navigation, header, footer, sidebar) that appear on multiple pages should have GENERIC labels — "Main Navigation", "Page Header", "Page Footer" — not page-specific names. Reserve specific labels for page-unique content.

Give DISTINCT labels to different elements — never call two different things by the same name.

## No duplicates — one entry per DOM region

Each physical region of the page should appear EXACTLY ONCE in your output. Do not create multiple entries for the same section:
- If a \`<section>\` contains a \`<table>\`, return the TABLE (wrapperType: "table"), NOT both the section AND the table — the table IS the section
- If a heading + table are wrapped in a \`<div>\`, return one entry for the table (using the heading for the label), not separate entries for the div and the table
- If a \`<section>\` or \`<div>\` has a heading and content, return ONE entry for that region — not one for the heading area and another for the content area
- Pick the most semantically meaningful element: prefer \`<table>\` over its parent \`<section>\`, prefer \`<form>\` over its parent \`<div>\`
- NEVER return two groups with the same containerIndex (data-pw-cid)

## Tables and grids — EVERY one matters

Every table or grid in the DOM is a meaningful section. This includes:
- Native \`<table>\` elements
- Elements with \`role="table"\`, \`role="grid"\`, or \`role="treegrid"\`
- Div-based data grids (common in frameworks like AG Grid, Material UI, etc.) — look for repeated row structures with column-like children

For EACH table/grid found:
- Look at \`<th>\` elements, column header cells, \`aria-label\`, \`id\`, heading text, or \`<caption>\` to name it
- Give each a UNIQUE, descriptive label: "Products Table", "Order History Table" — NOT "Table 1", "Table 2"
- Set wrapperType to "table" for ALL tables and grids
- If you see multiple tables, you MUST return a separate group entry for each one — do NOT merge them or skip any

## Output

Return a JSON object with "pageName" and "groups" array.
Return ONLY the JSON object. No markdown, no explanation, no code fences.`;

// ── Message builders ────────────────────────────────────────

/**
 * Build the user message content for the AI.
 * Returns text (with cleaned DOM HTML + ARIA snapshot) and the base64 screenshot.
 */
export function buildUserMessage(
  screenshot: Buffer,
  cleanedDom: string,
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
## Cleaned Page DOM (PRIMARY — use data-pw-cid values for containerIndex)

\`\`\`html
${cleanedDom}
\`\`\`

## ARIA Snapshot (SUPPLEMENTARY — use for semantic roles and accessible names)

${ariaSnapshot}

The screenshot provides visual context. Identify every meaningful section and return the result as a JSON object with "pageName" and "groups" array. Each group MUST include a "containerIndex" matching a data-pw-cid value from the DOM.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}
