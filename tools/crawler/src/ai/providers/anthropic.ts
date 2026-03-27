/**
 * Anthropic provider — uses Claude with vision for page analysis.
 *
 * Uses the Anthropic Messages API directly via fetch.
 * Set ANTHROPIC_API_KEY environment variable or pass via --ai-key.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";
import { SYSTEM_PROMPT, buildUserMessage } from "../prompt.js";

interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  }

  async analyzePageGroups(input: AiPageInput): Promise<AiDiscoveredGroup[]> {
    const { text, imageBase64 } = buildUserMessage(
      input.screenshot,
      input.accessibilityTree,
      input.url,
    );

    const body = {
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: imageBase64 },
            },
            { type: "text", text },
          ],
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find(b => b.type === "text");
    if (!textBlock?.text) throw new Error("Anthropic returned empty response");

    // Claude may wrap JSON in markdown code fences — strip them
    const raw = textBlock.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(raw) as { groups: AiDiscoveredGroup[] };
    return parsed.groups ?? [];
  }
}
