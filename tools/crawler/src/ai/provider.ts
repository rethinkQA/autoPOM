/**
 * AI provider factory — creates the right provider based on config.
 *
 * Provider dependencies (openai, @anthropic-ai/sdk) are loaded via
 * dynamic import so they remain optional — users only need to install
 * the package for the provider they actually use.
 */

import type { AiProvider, AiProviderConfig, AiProviderName } from "./types.js";

/** Default models per provider. */
const DEFAULT_MODELS: Record<AiProviderName, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  ollama: "llava",
};

/** Environment variable names for API keys per provider. */
const ENV_KEY_NAMES: Record<AiProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: "", // Ollama doesn't need an API key
};

/**
 * Create an AI provider instance from configuration.
 *
 * Resolves the API key from config or environment, selects a default
 * model if none is specified, and dynamically imports the provider
 * implementation.
 */
export async function createAiProvider(config: AiProviderConfig): Promise<AiProvider> {
  const model = config.model ?? DEFAULT_MODELS[config.provider];
  const envKey = ENV_KEY_NAMES[config.provider];
  const apiKey = config.apiKey ?? (envKey ? process.env[envKey] : undefined);

  if (config.provider !== "ollama" && !apiKey) {
    throw new Error(
      `Missing API key for ${config.provider}. ` +
      `Set ${envKey} environment variable or pass --ai-key.`,
    );
  }

  switch (config.provider) {
    case "openai": {
      const { OpenAiProvider } = await import("./providers/openai.js");
      return new OpenAiProvider({ apiKey: apiKey!, model, baseUrl: config.baseUrl });
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic.js");
      return new AnthropicProvider({ apiKey: apiKey!, model, baseUrl: config.baseUrl });
    }
    case "ollama": {
      const { OllamaProvider } = await import("./providers/ollama.js");
      return new OllamaProvider({ model, baseUrl: config.baseUrl ?? "http://localhost:11434" });
    }
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
