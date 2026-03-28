/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page screenshot and
 * accessibility tree, then return a JSON array of UI groups
 * matching our manifest schema. The output JSON schema is
 * embedded in the system prompt to enforce consistent structure.
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

export const SYSTEM_PROMPT = `You are a UI analysis agent for an automated testing tool. Your job is to identify all meaningful UI groups on a web page by analyzing a screenshot and an accessibility tree.

## What is a "group"?

A group is any distinct visual or functional region a QA engineer would target in a page object. Examples:

- Navigation bars (nav)
- Headers and footers (header, footer)
- Card grids or product lists (section)
- Filter panels or search bars (form, section)
- Data tables (table wrapper)
- Form sections — login, checkout, settings (form, fieldset)
- Sidebars (aside)
- Tab bars (tablist)
- Toolbars (toolbar)
- Dialogs/modals (dialog wrapper)
- Toast notifications (toast wrapper)
- Date pickers (datePicker wrapper)
- Accordion/collapsible sections (details)
- Any visually distinct panel, card container, or content region (section, region)

## Rules

1. Identify ALL visible groups on the page — both layout landmarks and content regions.
2. Use the screenshot to see visual groupings (cards, panels, bordered regions).
3. Use the accessibility tree to get accurate labels and roles.
4. Each group needs a label (short, 2-5 words), groupType, and wrapperType.
5. For accessibilityRole and accessibilityName, match to the closest node in the accessibility tree.
6. Do NOT include individual interactive elements (single buttons, links, inputs). Only containers/regions.
7. Do NOT include the page itself (<body>, <html>) as a group.
8. Prefer specific groupTypes over "generic" — use "generic" only when nothing else fits.
9. If a region contains a data table, use wrapperType "table". Name the table by WHAT DATA it contains — look at the column headers and row content to determine the subject. For example, a table with columns "Name, Price, Category" is a "Products Table", not "Data Table" or "Name Table".
10. If a region is a modal/dialog overlay, use wrapperType "dialog".
11. If a region shows transient notifications, use wrapperType "toast".
12. Label every group by its PURPOSE or CONTENT, not by its first text or HTML structure. Read the page like a human — the heading above a section, the column headers in a table, the fields in a form all tell you what it IS.
13. When previously discovered pages are provided, maintain naming consistency. If you see the same element (e.g. a navigation bar, a shared header) that was already labeled on another page, use the SAME label. Conversely, if two different elements exist (e.g. two different tables with different data), give them DISTINCT labels — never call two different things by the same name.

## Output format

Return a JSON object with a single "groups" array. Each entry has:
- label: string (2-5 words, human-readable)
- groupType: one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: one of [group, table, dialog, toast, datePicker]
- description: string (one sentence explaining what this group is)
- accessibilityRole: string (ARIA role from the a11y tree, if found)
- accessibilityName: string (accessible name from the a11y tree, if found)

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
