/**
 * AI prompt construction — builds the messages sent to the LLM.
 *
 * The prompt instructs the AI to analyze a page screenshot and
 * accessibility tree, then return a JSON array of UI groups
 * matching our manifest schema. The output JSON schema is
 * embedded in the system prompt to enforce consistent structure.
 */



// ── Output JSON schema (for structured output / validation) ─

/**
 * JSON schema describing the expected AI output.
 * Used by providers that support structured output (OpenAI, Anthropic).
 */
export const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    groups: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          label: {
            type: "string" as const,
            description: "Short human-readable name for this group (2-5 words).",
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
  required: ["groups" as const],
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
9. If a region contains a data table, use wrapperType "table".
10. If a region is a modal/dialog overlay, use wrapperType "dialog".
11. If a region shows transient notifications, use wrapperType "toast".

## Output format

Return a JSON object with a single "groups" array. Each entry has:
- label: string (2-5 words, human-readable)
- groupType: one of [nav, header, footer, main, aside, section, fieldset, form, region, toolbar, tablist, menu, menubar, details, generic]
- wrapperType: one of [group, table, dialog, toast, datePicker]
- description: string (one sentence explaining what this group is)
- accessibilityRole: string (ARIA role from the a11y tree, if found)
- accessibilityName: string (accessible name from the a11y tree, if found)

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
): { text: string; imageBase64: string } {
  const text = `Analyze this web page and identify all UI groups.

Page URL: ${url}

## ARIA Snapshot (YAML)

${ariaSnapshot}

Now look at the screenshot and identify every meaningful UI group on this page. Return the result as a JSON object with a "groups" array.`;

  const imageBase64 = screenshot.toString("base64");

  return { text, imageBase64 };
}
