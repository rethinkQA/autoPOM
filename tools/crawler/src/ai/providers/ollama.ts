/**
 * Ollama provider — uses local LLMs (e.g. llava) for page analysis.
 *
 * Requires a running Ollama server (default: http://localhost:11434).
 * No API key needed. Supports multimodal models like llava, llava-llama3, bakllava.
 *
 * Uses the /api/chat endpoint with a simplified prompt — small vision
 * models (7B–13B) struggle with long structured instructions AND with
 * Ollama's `format: "json"` constraint (which produces `{}`).
 * Instead we let the model respond in free text and extract JSON via regex.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";

/**
 * System message — kept very short with a complete filled-in example
 * so the model can mimic the structure.
 */
const SYSTEM_MSG = `You analyze web page screenshots. When the user shows you a web page, identify the major UI sections (forms, navbars, headers, footers, tables, card grids, dialogs, etc).

Reply with a JSON object like this example:

{"groups":[{"label":"Login Form","groupType":"form"},{"label":"Page Header","groupType":"header"},{"label":"Nav Bar","groupType":"nav"}]}

Valid groupType values: nav, header, footer, main, aside, section, form, region, toolbar, menu, generic.

Only include the JSON object in your reply, nothing else.`;

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
    const userMsg = `What UI sections do you see on this page?

ARIA accessibility tree:
${input.accessibilityTree}`;

    const body = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_MSG },
        {
          role: "user",
          content: userMsg,
          images: [input.screenshot.toString("base64")],
        },
      ],
      stream: false,
      // Do NOT set format: "json" — llava produces {} with that constraint.
      options: {
        temperature: 0,
        num_predict: 4096,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { message?: { content?: string } };
    const text = data.message?.content ?? "";

    if (!text) throw new Error("Ollama returned empty response");

    console.error(`  🤖 Raw ollama response: ${text.slice(0, 500)}`);

    return extractGroups(text);
  }
}

/**
 * Extract a groups array from free-text LLM output.
 * Tries JSON.parse first, then falls back to regex extraction.
 */
function extractGroups(text: string): AiDiscoveredGroup[] {
  // Try parsing the entire response as JSON
  try {
    const obj = JSON.parse(text) as { groups?: AiDiscoveredGroup[] };
    if (Array.isArray(obj.groups) && obj.groups.length > 0) return obj.groups;
  } catch { /* not pure JSON — try extracting */ }

  // Try extracting a JSON object from surrounding text
  const match = text.match(/\{[\s\S]*"groups"\s*:\s*\[[\s\S]*\]\s*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { groups?: AiDiscoveredGroup[] };
      if (Array.isArray(obj.groups) && obj.groups.length > 0) return obj.groups;
    } catch { /* malformed JSON */ }
  }

  // Try extracting a bare JSON array
  const arrMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]) as AiDiscoveredGroup[];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch { /* malformed */ }
  }

  return [];
}
