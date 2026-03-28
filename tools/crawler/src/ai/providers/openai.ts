/**
 * OpenAI provider — uses GPT-4o vision for page analysis.
 *
 * Requires the `openai` npm package (optional peer dependency).
 * Set OPENAI_API_KEY environment variable or pass via --ai-key.
 */

import type { AiProvider, AiPageInput, AiAnalysisResult, AiDiscoveredGroup, AiCurationInput, AiCurationResult, AiCurationDecision } from "../types.js";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, buildUserMessage, CURATION_PROMPT, CURATION_SCHEMA, buildCurationMessage } from "../prompt.js";

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OpenAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async analyzePageGroups(input: AiPageInput): Promise<AiAnalysisResult> {
    const { text, imageBase64 } = buildUserMessage(
      input.screenshot,
      input.accessibilityTree,
      input.url,
      input.previousPages,
    );

    const body = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "page_groups", schema: OUTPUT_SCHEMA, strict: true },
      },
      max_tokens: 4096,
      temperature: 0,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty response");

    const parsed = JSON.parse(content) as { pageName?: string; groups: AiDiscoveredGroup[] };
    return { pageName: parsed.pageName ?? "page", groups: parsed.groups ?? [] };
  }

  async curateGroups(input: AiCurationInput): Promise<AiCurationResult> {
    const { text, imageBase64 } = buildCurationMessage(
      input.screenshot,
      input.accessibilityTree,
      input.url,
      input.candidates,
      input.previousPages,
    );

    const body = {
      model: this.model,
      messages: [
        { role: "system", content: CURATION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "page_curation", schema: CURATION_SCHEMA, strict: true },
      },
      max_tokens: 4096,
      temperature: 0,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content2 = data.choices?.[0]?.message?.content;
    if (!content2) throw new Error("OpenAI returned empty response");

    const parsed2 = JSON.parse(content2) as { pageName?: string; decisions: AiCurationDecision[] };
    return { pageName: parsed2.pageName ?? "page", decisions: parsed2.decisions ?? [] };
  }
}
