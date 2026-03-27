/**
 * Ollama provider — uses local LLMs (e.g. llava) for page analysis.
 *
 * Requires a running Ollama server (default: http://localhost:11434).
 * No API key needed. Supports multimodal models like llava, llava-llama3, bakllava.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";
import { SYSTEM_PROMPT, buildUserMessage } from "../prompt.js";

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
    const { text, imageBase64 } = buildUserMessage(
      input.screenshot,
      input.accessibilityTree,
      input.url,
    );

    const prompt = `${SYSTEM_PROMPT}\n\n${text}`;

    const body = {
      model: this.model,
      prompt,
      images: [imageBase64],
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

    const parsed = JSON.parse(data.response) as { groups: AiDiscoveredGroup[] };
    return parsed.groups ?? [];
  }
}
