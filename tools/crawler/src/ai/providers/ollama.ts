/**
 * Ollama provider — uses local LLMs (e.g. llava) for page analysis.
 *
 * Requires a running Ollama server (default: http://localhost:11434).
 * No API key needed. Supports multimodal models like llava, llava-llama3, bakllava.
 *
 * Uses a simplified prompt compared to cloud providers because local
 * models (7B–13B) struggle with long structured instructions.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";

/** Short, direct prompt that small vision models can actually follow. */
const OLLAMA_PROMPT = `Look at this web page screenshot and the ARIA accessibility tree below.

List every distinct UI section/region you see (nav bars, forms, headers, footers, sidebars, card grids, tables, dialogs, etc). Do NOT list individual buttons or links — only containers/regions.

Return JSON: {"groups": [{"label": "short name", "groupType": "one of: nav|header|footer|main|aside|section|form|fieldset|region|toolbar|tablist|menu|details|generic", "wrapperType": "one of: group|table|dialog|toast|datePicker", "description": "one sentence", "accessibilityRole": "ARIA role if known", "accessibilityName": "accessible name if known"}]}

If you see a login form, that is a "form" groupType with wrapperType "group".
If you see a navigation bar, that is a "nav" groupType.
If you see a header area, that is a "header" groupType.

Return ONLY the JSON object. No explanation.`;

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
    const prompt = `${OLLAMA_PROMPT}

## ARIA Snapshot

${input.accessibilityTree}

Page URL: ${input.url}

Now identify every UI group/section visible on this page. Return JSON.`;

    const body = {
      model: this.model,
      prompt,
      images: [input.screenshot.toString("base64")],
      stream: false,
      format: "json",
      options: {
        temperature: 0,
        num_predict: 4096,
      },
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

    const data = await response.json() as { response: string };

    if (!data.response) throw new Error("Ollama returned empty response");

    console.error(`  🤖 Raw ollama response: ${data.response.slice(0, 500)}`);

    const parsed = JSON.parse(data.response) as { groups?: AiDiscoveredGroup[] };
    return parsed.groups ?? [];
  }
}
