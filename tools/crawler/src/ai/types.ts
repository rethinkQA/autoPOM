/**
 * AI-powered group discovery — types.
 *
 * Defines the provider interface and data structures for
 * AI-assisted UI group identification. Providers analyze a
 * page screenshot + accessibility tree and return structured
 * group descriptions that get mapped to DOM selectors.
 */

import type { GroupType, WrapperType } from "../types.js";

// ── Provider configuration ──────────────────────────────────

/** Supported AI provider names. */
export type AiProviderName = "openai" | "anthropic" | "ollama";

/** Configuration needed to create an AI provider instance. */
export interface AiProviderConfig {
  /** Which provider to use. */
  provider: AiProviderName;

  /** Model name/ID (e.g. "gpt-4o", "claude-sonnet-4-20250514", "llava"). */
  model?: string;

  /** API key — read from config or environment variable. */
  apiKey?: string;

  /** Base URL override (e.g. for Ollama: "http://localhost:11434"). */
  baseUrl?: string;
}

// ── Provider interface ──────────────────────────────────────

/** Input sent to the AI provider for page analysis. */
export interface AiPageInput {
  /** Full-page screenshot as PNG buffer. */
  screenshot: Buffer;

  /** Playwright ARIA snapshot (YAML string from locator.ariaSnapshot()). */
  accessibilityTree: string;

  /** The page URL path (no origin). */
  url: string;
}

/** A single group identified by the AI. */
export interface AiDiscoveredGroup {
  /** Human-readable label for the group. */
  label: string;

  /** Semantic type of the group. */
  groupType: GroupType;

  /** Wrapper type for code generation. */
  wrapperType: WrapperType;

  /** AI's brief description of what this group contains / does. */
  description?: string;

  /** The accessibility role that matches this group in the a11y tree. */
  accessibilityRole?: string;

  /** The accessibility name that matches this group in the a11y tree. */
  accessibilityName?: string;
}

/** Full result from AI page analysis. */
export interface AiAnalysisResult {
  /** AI-determined page name (2-4 words). */
  pageName: string;
  /** UI groups found on the page. */
  groups: AiDiscoveredGroup[];
}

/**
 * AI provider — analyzes a page and returns discovered groups.
 *
 * Implementations wrap specific LLM APIs (OpenAI, Anthropic, Ollama)
 * but all share this interface so the crawler is provider-agnostic.
 */
export interface AiProvider {
  /** Human-readable provider name (for logging). */
  readonly name: string;

  /**
   * Analyze a page screenshot + accessibility tree and return
   * the UI groups found on the page along with an AI-determined page name.
   */
  analyzePageGroups(input: AiPageInput): Promise<AiAnalysisResult>;
}


