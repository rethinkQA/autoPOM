/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page screenshot and
 * accessibility tree, then return a JSON array of UI groups
 * matching our manifest schema. The output JSON schema is
 * embedded in the system prompt to enforce consistent structure.
 */



import type { AiPageSummary, AiCurationCandidate } from "./types.js";

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

export const SYSTEM_PROMPT = `You are a UI analysis agent for an automated testing tool. Your job is to look at a web page — its screenshot and accessibility tree — and identify the meaningful groups that make up that page, the way a human would describe its layout.

## Your goal

Imagine a QA engineer opens this page and says: "What's on this page?" They would answer at the level of distinct functional areas — "There's a navigation bar at the top, a product table in the middle, a filter bar above it, and an order form below." They would NOT list individual buttons, columns, or input fields — those are details inside the groups.

Your job is to find that right level of grouping. Each group is a self-contained region of the page that serves a single purpose. Together, your groups should describe the page's complete structure.

## How to find the right level

1. **Look at the screenshot first.** Scan the page visually — what are the distinct regions? A human sees "a table here, a form there, a sidebar on the left" before reading any code.
2. **Use the accessibility tree to confirm.** The tree shows the hierarchy — containers (nav, table, form, section, aside) hold children (links, cells, inputs, buttons). Your groups should be at the CONTAINER level, not the child level.
3. **The right level is where purpose lives.** A navigation bar has a purpose (navigate the site). A single link inside it does not have an independent purpose — it's part of the nav. A table has a purpose (show product data). A single column header inside it does not — it's part of the table.
4. **Parent vs sibling.** If element B is a CHILD of element A and has no independent visual boundary, B is part of A (a sort button inside a table header → part of the table). But if A and B are SIBLINGS that each have their own heading, border, or distinct function, they are separate groups (a Quantity fieldset and a Shipping fieldset next to each other → two groups).
5. **Be thorough — find everything.** Err on the side of including more groups rather than fewer. Every distinct region on the page that a QA engineer might want to test should appear in your output. A page typically has 5-15 groups.

## What qualifies as a group

- Navigation bars, headers, footers — page-level landmarks
- Data tables — always ONE group per table, regardless of how many columns/rows
- Forms and fieldsets — a login form, a settings panel, a checkout section
- Filter/search bars — controls that filter or search content
- Sidebars, panels, card grids — visually distinct content areas
- Tab bars, toolbars, menus — interactive control regions
- Dialogs/modals, toast notifications, date pickers — overlay/transient UI
- Any visually distinct section with its own heading or bordered region

## What does NOT qualify

- Individual interactive elements that live INSIDE a group: a single button, link, input, or checkbox with no visual boundary of its own
- The page itself (<body>, <html>)
- Invisible or purely structural wrappers with no visual/functional identity

## Rules

1. Identify ALL visible groups — both layout landmarks and content regions.
2. Use the screenshot to see visual groupings; use the accessibility tree for accurate labels and roles.
3. Each group needs a label (short, 2-5 words), groupType, and wrapperType.
4. For accessibilityRole and accessibilityName, match to the closest container node in the accessibility tree — the node that represents the group, not a child element inside it.
5. Prefer specific groupTypes over "generic" — use "generic" only when nothing else fits.
6. Label every group by its PURPOSE or CONTENT, not by its HTML structure or first text. Read the page like a human — the heading above a section, the column headers in a table, the fields in a form all tell you what it IS.
7. For tables: use wrapperType "table". Read ALL column headers together and ask "what are these rows about?" — columns "Name, Price, Category, Stock" → "Products Table" because each row is a product. Never name a table after a single column ("Name Table") or generically ("Data Table").
8. For dialogs/modals: use wrapperType "dialog". For toast notifications: "toast". For date pickers: "datePicker".
9. When previously discovered pages are provided, maintain naming consistency. Reuse the same label for shared elements (e.g. navigation, header) and give DISTINCT labels to different elements — never call two different things by the same name.

## Output format

Return a JSON object with a single "groups" array. Each entry has:
- label: string (2-5 words, human-readable)
- groupType: one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: one of [group, table, dialog, toast, datePicker]
- description: string (one sentence explaining what this group is)
- accessibilityRole: string (ARIA role from the a11y tree — the CONTAINER node, not a child)
- accessibilityName: string (accessible name from the a11y tree for that container)

Also include a "pageName" field — a short, lowercase, kebab-case name for this page (1-3 words) based on its primary purpose. Examples: "login", "buildings", "device-list", "dashboard". Do NOT use the full URL path.

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

  const text = `Analyze this web page and identify all UI groups.

Page URL: ${url}
${contextSection}
## ARIA Snapshot (YAML)

${ariaSnapshot}

Now look at the screenshot and identify every meaningful UI group on this page. Return the result as a JSON object with a "groups" array.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}

// ── Curation prompt (hybrid approach) ───────────────────────

/**
 * JSON schema for the AI curation response.
 */
export const CURATION_SCHEMA = {
  type: "object" as const,
  properties: {
    pageName: {
      type: "string" as const,
      description: "A short, lowercase, kebab-case name for this page (1-3 words). Use the page's primary purpose, e.g. 'login', 'buildings', 'device-list', 'dashboard'.",
    },
    decisions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          index: {
            type: "number" as const,
            description: "The index of the candidate from the input list.",
          },
          action: {
            type: "string" as const,
            enum: ["keep", "remove"],
            description: "Whether to keep or remove this candidate.",
          },
          label: {
            type: "string" as const,
            description: "A better human-readable label for this group (2-5 words). Required when action is 'keep'.",
          },
          reason: {
            type: "string" as const,
            description: "Brief reason for removal. Required when action is 'remove'.",
          },
        },
        required: ["index", "action", "label", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["pageName" as const, "decisions" as const],
  additionalProperties: false,
};

export const CURATION_PROMPT = `You are a UI analysis agent for an automated testing tool. You will receive a list of DOM element candidates that were found by heuristic analysis, along with a screenshot and accessibility tree of the page.

## Your job

For each candidate, decide whether to KEEP or REMOVE it, and give every kept group a clear, human-readable label.

## How to decide

Look at the screenshot and accessibility tree. For each candidate:

1. **KEEP** if it represents a meaningful, testable region of the page — something a QA engineer would describe when asked "what's on this page?" Examples: navigation bars, data tables, forms, filter bars, sidebars, card sections, toolbars, dialogs.

2. **REMOVE** if it is:
   - A purely structural/invisible wrapper with no visual identity (e.g. a div that just wraps other groups)
   - A duplicate of another candidate that covers the same visual region (keep the more specific one)
   - Not visible on the page
   - An internal implementation detail (style containers, script wrappers)
   - A tiny decoration or separator with no interactive or informational value

## How to label

- Name each group by its PURPOSE or CONTENT, not its HTML structure
- Read the screenshot like a human: what IS this section? A products table, a login form, a main navigation
- For tables: read the column headers — "Name, Price, Category" → "Products Table" because each row is a product
- For forms: what does it collect? "Login Form", "Search Filters", "Shipping Address"
- For navigation: where does it navigate? "Main Navigation", "Sidebar Menu", "Breadcrumbs"
- Use 2-5 words. Be specific, not generic ("Products Table" not "Data Table")
- The heuristic label is provided as a hint — use it if it's good, replace it if it's generic or wrong

## Naming consistency

When previously discovered pages are provided, reuse the same label for shared elements (e.g. navigation bars, headers that appear on multiple pages). Give DISTINCT labels to different elements.

## Output format

Return a JSON object with:
- "pageName": short kebab-case name for this page (1-3 words)
- "decisions": array with one entry per candidate, each having:
  - "index": number (matching the candidate's index)
  - "action": "keep" or "remove"
  - "label": string (your chosen label — required for both keep and remove, use heuristic label for removed items)
  - "reason": string (brief explanation — required for both, use "" for kept items)

You MUST return a decision for every candidate. Do not skip any.

Return ONLY the JSON object. No markdown, no explanation, no code fences.`;

/**
 * Build the user message for AI curation.
 */
export function buildCurationMessage(
  screenshot: Buffer,
  ariaSnapshot: string,
  url: string,
  candidates: AiCurationCandidate[],
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
    contextSection = `\n## Previously discovered pages\n\n${entries.join("\n\n")}\n`;
  }

  const candidateList = candidates.map((c) => {
    const attrs: string[] = [];
    if (c.ariaLabel) attrs.push(`aria-label="${c.ariaLabel}"`);
    if (c.headingText) attrs.push(`heading="${c.headingText}"`);
    if (c.legendText) attrs.push(`legend="${c.legendText}"`);
    if (c.captionText) attrs.push(`caption="${c.captionText}"`);
    if (c.id) attrs.push(`id="${c.id}"`);
    const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
    return `  ${c.index}. <${c.tagName}> ${c.groupType}/${c.wrapperType} — "${c.heuristicLabel}" (via ${c.labelSource})${attrStr}\n     selector: ${c.selector}`;
  }).join("\n");

  const text = `Curate the following ${candidates.length} DOM candidates found on this page.

Page URL: ${url}
${contextSection}
## Candidates

${candidateList}

## ARIA Snapshot (YAML)

${ariaSnapshot}

Look at the screenshot above. For each candidate, decide keep/remove and assign a good label.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}
