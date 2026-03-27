/**
 * Ollama provider — uses local LLMs (e.g. llava) for page analysis.
 *
 * Requires a running Ollama server (default: http://localhost:11434).
 * No API key needed. Supports multimodal models like llava, llava-llama3, bakllava.
 *
 * Strategy for small models (7B–13B):
 *   Phase 1: Ask for JSON groups (works for smarter models)
 *   Phase 2: If 0 groups, ask model to simply DESCRIBE the page,
 *            then parse keywords from the natural language into groups.
 *
 * This two-phase approach ensures we get useful output even from the
 * weakest vision models — any model can describe what it sees.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";
import type { GroupType } from "../../types.js";

// ── Prompts ─────────────────────────────────────────────────

/** Phase 1: Structured JSON request (works for capable models). */
const JSON_SYSTEM = `You analyze web page screenshots. Identify the major UI sections (forms, navbars, headers, footers, tables, card grids, dialogs, etc).

Reply with ONLY a JSON object like this example:

{"groups":[{"label":"Login Form","groupType":"form"},{"label":"Page Header","groupType":"header"},{"label":"Nav Bar","groupType":"nav"}]}

Valid groupType values: nav, header, footer, main, aside, section, form, region, toolbar, menu, generic.
No explanation — only the JSON.`;

/** Phase 2: Plain description request (any vision model can do this). */
const DESCRIBE_PROMPT = `Describe what you see on this web page screenshot. List the main sections, forms, buttons, navigation bars, headers, footers, tables, and other UI areas. Be specific about what each section contains.`;

// ── Keyword → GroupType mapping for NL parsing ──────────────

const KEYWORD_MAP: Array<{ pattern: RegExp; groupType: GroupType; label: (m: RegExpMatchArray) => string }> = [
  { pattern: /\b(login|sign[- ]?in|authentication)\s*(form|page|section|area|screen)?\b/i, groupType: "form", label: () => "Login Form" },
  { pattern: /\b(registration|sign[- ]?up|register)\s*(form|page|section|area)?\b/i, groupType: "form", label: () => "Registration Form" },
  { pattern: /\b(search)\s*(form|bar|box|field|section)?\b/i, groupType: "form", label: () => "Search Form" },
  { pattern: /\b(form|input\s*fields?)\b/i, groupType: "form", label: () => "Form" },
  { pattern: /\b(nav(igation)?)\s*(bar|menu|links|section|area)?\b/i, groupType: "nav", label: () => "Navigation" },
  { pattern: /\b(header|banner|top\s*bar|title\s*bar)\b/i, groupType: "header", label: () => "Header" },
  { pattern: /\b(footer|bottom\s*bar)\b/i, groupType: "footer", label: () => "Footer" },
  { pattern: /\b(sidebar|side\s*panel|side\s*bar)\b/i, groupType: "aside", label: () => "Sidebar" },
  { pattern: /\b(table|data\s*grid|spreadsheet)\b/i, groupType: "section", label: () => "Data Table" },
  { pattern: /\b(card\s*(grid|list|section|layout)|grid\s*of\s*cards)\b/i, groupType: "section", label: () => "Card Grid" },
  { pattern: /\b(dialog|modal|popup|overlay)\b/i, groupType: "region", label: () => "Dialog" },
  { pattern: /\b(toolbar|action\s*bar|button\s*bar)\b/i, groupType: "toolbar", label: () => "Toolbar" },
  { pattern: /\b(menu|dropdown\s*menu)\b/i, groupType: "menu", label: () => "Menu" },
  { pattern: /\b(tab\s*bar|tab\s*list|tabs)\b/i, groupType: "section", label: () => "Tabs" },
  { pattern: /\b(main\s*content|content\s*area|body)\b/i, groupType: "main", label: () => "Main Content" },
];

// Also infer groups from the ARIA tree keywords
const ARIA_PATTERNS: Array<{ pattern: RegExp; groupType: GroupType; label: string }> = [
  { pattern: /textbox\s+"(Username|Email|User)/i, groupType: "form", label: "Login Form" },
  { pattern: /textbox\s+"Password/i, groupType: "form", label: "Login Form" },
  { pattern: /button\s+".*Sign\s*In/i, groupType: "form", label: "Login Form" },
  { pattern: /button\s+".*Log\s*In/i, groupType: "form", label: "Login Form" },
  { pattern: /navigation\b/i, groupType: "nav", label: "Navigation" },
  { pattern: /banner\b/i, groupType: "header", label: "Header" },
  { pattern: /contentinfo\b/i, groupType: "footer", label: "Footer" },
  { pattern: /search\b/i, groupType: "form", label: "Search" },
];

// ── Provider ────────────────────────────────────────────────

interface OllamaProviderOptions {
  model: string;
  baseUrl: string;
}

export class OllamaProvider implements AiProvider {
  readonly name = "ollama";
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OllamaProviderOptions) {
    this.model = options.model;
    this.baseUrl = options.baseUrl;
  }

  async analyzePageGroups(input: AiPageInput): Promise<AiDiscoveredGroup[]> {
    const base64Img = input.screenshot.toString("base64");

    // Phase 1: Try structured JSON
    const jsonGroups = await this.tryJsonPhase(input.accessibilityTree, base64Img);
    if (jsonGroups.length > 0) return jsonGroups;

    console.error("  🤖 Phase 1 (JSON) returned 0 — trying Phase 2 (describe)…");

    // Phase 2: Ask to describe, then parse keywords
    const description = await this.describePhase(base64Img);
    const nlGroups = parseDescription(description, input.accessibilityTree);

    if (nlGroups.length > 0) {
      console.error(`  🤖 Phase 2 parsed ${nlGroups.length} group(s) from description.`);
    } else {
      // Phase 3: Last resort — infer from ARIA tree alone (no AI needed)
      console.error("  🤖 Phase 2 found 0 — inferring from ARIA tree…");
      const ariaGroups = inferFromAria(input.accessibilityTree);
      return ariaGroups;
    }

    return nlGroups;
  }

  /** Phase 1: Ask for JSON groups. */
  private async tryJsonPhase(ariaTree: string, base64Img: string): Promise<AiDiscoveredGroup[]> {
    const userMsg = `What UI sections do you see on this page?\n\nARIA tree:\n${ariaTree}`;

    const text = await this.chat(JSON_SYSTEM, userMsg, base64Img);
    console.error(`  🤖 Raw ollama response (phase 1): ${text.slice(0, 500)}`);

    return extractGroups(text);
  }

  /** Phase 2: Ask to describe the page in natural language. */
  private async describePhase(base64Img: string): Promise<string> {
    const text = await this.chat(
      "You are a helpful assistant that describes web pages.",
      DESCRIBE_PROMPT,
      base64Img,
    );
    console.error(`  🤖 Raw ollama response (phase 2): ${text.slice(0, 500)}`);
    return text;
  }

  /**
   * Send a generate request to Ollama.
   * Uses /api/generate (not /api/chat) because llava returns empty
   * strings with the chat endpoint on many Ollama versions.
   */
  private async chat(system: string, user: string, base64Img: string): Promise<string> {
    const body = {
      model: this.model,
      system,
      prompt: user,
      images: [base64Img],
      stream: false,
      // No format: "json" — llava outputs {} with that constraint.
      options: { temperature: 0, num_predict: 4096 },
    };

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { response?: string };
    return data.response ?? "";
  }
}

// ── Extraction helpers ──────────────────────────────────────

/** Try to extract JSON groups from LLM text. */
function extractGroups(text: string): AiDiscoveredGroup[] {
  // Try parsing the whole response
  try {
    const obj = JSON.parse(text) as { groups?: AiDiscoveredGroup[] };
    if (Array.isArray(obj.groups) && obj.groups.length > 0) return normalize(obj.groups);
  } catch { /* not pure JSON */ }

  // Try extracting a JSON block from prose
  const match = text.match(/\{[\s\S]*"groups"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { groups?: AiDiscoveredGroup[] };
      if (Array.isArray(obj.groups) && obj.groups.length > 0) return normalize(obj.groups);
    } catch { /* malformed */ }
  }

  // Try a bare array
  const arrMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]) as AiDiscoveredGroup[];
      if (Array.isArray(arr) && arr.length > 0) return normalize(arr);
    } catch { /* malformed */ }
  }

  return [];
}

/** Ensure every group has required fields with sensible defaults. */
function normalize(groups: Partial<AiDiscoveredGroup>[]): AiDiscoveredGroup[] {
  return groups
    .filter(g => g.label)
    .map(g => ({
      label: g.label!,
      groupType: (g.groupType as GroupType) || "generic",
      wrapperType: g.wrapperType || "group",
      description: g.description,
      accessibilityRole: g.accessibilityRole,
      accessibilityName: g.accessibilityName,
    }));
}

/**
 * Parse a natural language page description into groups using keyword matching.
 * Also includes ARIA tree analysis for reinforcement.
 */
function parseDescription(description: string, ariaTree: string): AiDiscoveredGroup[] {
  const found = new Map<string, AiDiscoveredGroup>();

  // Match keywords from the AI's description
  for (const { pattern, groupType, label } of KEYWORD_MAP) {
    const m = description.match(pattern);
    if (m) {
      const lbl = label(m);
      if (!found.has(lbl)) {
        found.set(lbl, { label: lbl, groupType, wrapperType: "group" });
      }
    }
  }

  // Reinforce with ARIA tree patterns
  for (const { pattern, groupType, label } of ARIA_PATTERNS) {
    if (pattern.test(ariaTree) && !found.has(label)) {
      found.set(label, { label, groupType, wrapperType: "group" });
    }
  }

  return Array.from(found.values());
}

/**
 * Phase 3 fallback: infer groups purely from ARIA tree keywords.
 * No AI call — just pattern matching on the accessibility snapshot.
 */
function inferFromAria(ariaTree: string): AiDiscoveredGroup[] {
  const found = new Map<string, AiDiscoveredGroup>();

  for (const { pattern, groupType, label } of ARIA_PATTERNS) {
    if (pattern.test(ariaTree) && !found.has(label)) {
      found.set(label, { label, groupType, wrapperType: "group" });
    }
  }

  return Array.from(found.values());
}
