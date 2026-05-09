/**
 * Anthropic Messages API tool-use agent.
 *
 * Implements `IExplorationAgent` by exposing four tools to Claude
 * (`click_candidate`, `click_locator`, `navigate`, `stop`) and translating
 * the model's `tool_use` response into an `AgentDecision`. Uses raw `fetch`
 * to avoid an SDK dependency, following the same pattern as the existing
 * `AnthropicProvider` for DOM analysis.
 *
 * The system prompt and tool schema are stable across requests so they
 * benefit from prompt caching when the user explicitly enables it; the
 * adapter does not currently set `cache_control` headers, but the prompt
 * shape is cache-friendly for future opt-in.
 */

import type {
  AgentDecision,
  AgentObservation,
  IExplorationAgent,
} from "../agent-types.js";
import type { ActionLocatorHint } from "../explore-types.js";

// ── Configuration ───────────────────────────────────────────

/** Options for {@link createAnthropicAgent}. */
export interface AnthropicAgentOptions {
  /** API key (falls back to `ANTHROPIC_API_KEY` env). */
  apiKey?: string;

  /** Model id (default: claude-sonnet-4-20250514). */
  model?: string;

  /** Override Anthropic API base URL. */
  baseUrl?: string;

  /** Maximum tokens per response (default: 1024 — decisions are small). */
  maxTokens?: number;

  /** Optional system prompt override. */
  systemPrompt?: string;

  /** Optional model-side tool-choice override. */
  toolChoice?: { type: "auto" } | { type: "tool"; name: string };
}

/** Default model when `options.model` is omitted. */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MAX_TOKENS = 1024;

const DEFAULT_SYSTEM_PROMPT = `You are an exploration agent that drives a web app to discover its page object surface.

Each turn you receive an observation:
- the current URL, route template, and title
- manifest groups already discovered for this route
- a numbered list of visible action candidates with role/label/risk/signature
- recent history (your last few decisions and their outcomes)
- the remaining action budget

Choose the next exploration action by calling exactly one tool:
- click_candidate(index): pick from visibleActions when one of the listed candidates fits
- click_locator(locator, label): construct a locator (role+name preferred) when the desired action is not in the list
- navigate(url): jump to a route directly when faster than clicking
- stop(reason): end exploration when no useful actions remain or the surface is fully covered

Rules:
- Never call destructive actions (delete, sign out, purchase, checkout, reset, confirm).
- Prefer actions that uncover new groups, dialogs, menus, or routes.
- Prefer click_candidate when a suitable candidate exists.
- Stop early when you observe consecutive turns with no new groups or no progress.
- Be concise in rationales (one short sentence).`;

// ── Tool schemas ────────────────────────────────────────────

const TOOLS = [
  {
    name: "click_candidate",
    description:
      "Click one of the visible action candidates by its index in observation.visibleActions.",
    input_schema: {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 0,
          description: "Zero-based index of the candidate to click.",
        },
        rationale: {
          type: "string",
          description: "Short reason for picking this candidate.",
        },
      },
      required: ["index"],
    },
  },
  {
    name: "click_locator",
    description:
      "Click a custom locator when no listed candidate fits. Prefer role+name; fall back to label, testId, text, or selector.",
    input_schema: {
      type: "object",
      properties: {
        locator: {
          type: "object",
          properties: {
            role: { type: "string" },
            name: { type: "string" },
            label: { type: "string" },
            testId: { type: "string" },
            text: { type: "string" },
            selector: { type: "string" },
          },
        },
        label: { type: "string", description: "Human-readable label for graph records." },
        rationale: { type: "string" },
      },
      required: ["locator", "label"],
    },
  },
  {
    name: "navigate",
    description: "Navigate the browser directly to a URL or path.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["url"],
    },
  },
  {
    name: "stop",
    description: "Stop exploration. Use when the page object surface is fully discovered or no useful actions remain.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
] as const;

// ── Anthropic Messages API surface ──────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
}

// ── Agent implementation ────────────────────────────────────

/** Build an Anthropic-backed exploration agent. */
export function createAnthropicAgent(options: AnthropicAgentOptions = {}): IExplorationAgent {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key for anthropic agent. Set ANTHROPIC_API_KEY or pass --ai-key.",
    );
  }
  const model = options.model ?? DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const toolChoice = options.toolChoice ?? { type: "auto" };

  return {
    name: `anthropic:${model}`,
    async decide(observation: AgentObservation): Promise<AgentDecision> {
      const message = formatObservationMessage(observation);
      const response = await callAnthropic({
        apiKey,
        baseUrl,
        body: {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          tools: TOOLS,
          tool_choice: toolChoice,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: message }],
            },
          ],
        },
      });

      const decision = extractDecision(response);
      if (!decision) {
        const fallback = pickFallback(observation);
        return fallback;
      }
      return decision;
    },
  };
}

interface CallArgs {
  apiKey: string;
  baseUrl: string;
  body: {
    model: string;
    max_tokens: number;
    system: string;
    tools: typeof TOOLS;
    tool_choice: { type: "auto" } | { type: "tool"; name: string };
    messages: AnthropicMessage[];
  };
}

async function callAnthropic(args: CallArgs): Promise<AnthropicMessagesResponse> {
  const response = await fetch(`${args.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(args.body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic agent API error (${response.status}): ${text}`);
  }
  return (await response.json()) as AnthropicMessagesResponse;
}

/** Translate Claude's tool_use block into an `AgentDecision`. */
export function extractDecision(response: AnthropicMessagesResponse): AgentDecision | null {
  const block = response.content?.find((b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
    b.type === "tool_use",
  );
  if (!block) return null;

  const input = block.input ?? {};

  switch (block.name) {
    case "click_candidate": {
      const index = numberOrThrow(input, "index");
      const rationale = stringOrUndefined(input, "rationale");
      return { kind: "click_candidate", index, rationale };
    }
    case "click_locator": {
      const rawLocator = (input as { locator?: unknown }).locator;
      if (!rawLocator || typeof rawLocator !== "object") return null;
      const locator = sanitizeLocator(rawLocator as Record<string, unknown>);
      const label = stringOrThrow(input, "label");
      const rationale = stringOrUndefined(input, "rationale");
      return { kind: "click_locator", locator, label, rationale };
    }
    case "navigate": {
      const url = stringOrThrow(input, "url");
      const rationale = stringOrUndefined(input, "rationale");
      return { kind: "navigate", url, rationale };
    }
    case "stop": {
      const reason = stringOrUndefined(input, "reason") ?? "agent stopped without explicit reason";
      return { kind: "stop", reason };
    }
    default:
      return null;
  }
}

function pickFallback(observation: AgentObservation): AgentDecision {
  // If the agent returned no usable tool, stop instead of looping forever.
  return {
    kind: "stop",
    reason: `agent returned no tool_use at iteration ${observation.iteration}; stopping`,
  };
}

function sanitizeLocator(raw: Record<string, unknown>): ActionLocatorHint {
  const result: ActionLocatorHint = {};
  if (typeof raw.role === "string") result.role = raw.role;
  if (typeof raw.name === "string") result.name = raw.name;
  if (typeof raw.label === "string") result.label = raw.label;
  if (typeof raw.testId === "string") result.testId = raw.testId;
  if (typeof raw.text === "string") result.text = raw.text;
  if (typeof raw.selector === "string") result.selector = raw.selector;
  return result;
}

function numberOrThrow(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`agent tool input missing numeric "${key}"`);
  }
  return Math.trunc(value);
}

function stringOrThrow(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`agent tool input missing string "${key}"`);
  }
  return value;
}

function stringOrUndefined(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

/** Format an `AgentObservation` for inclusion in the user message. */
export function formatObservationMessage(observation: AgentObservation): string {
  const lines: string[] = [];
  lines.push(`Iteration ${observation.iteration} (actions remaining: ${observation.budget.actionsRemaining}/${observation.budget.maxActions})`);
  lines.push(`URL: ${observation.url}`);
  lines.push(`Route template: ${observation.routeTemplate}`);
  lines.push(`Title: ${observation.title}`);

  if (observation.manifestGroupKeys.length > 0) {
    lines.push("");
    lines.push(`Discovered groups for this route (${observation.manifestGroupKeys.length}):`);
    for (const key of observation.manifestGroupKeys) lines.push(`  - ${key}`);
  } else {
    lines.push("");
    lines.push("No groups discovered yet for this route.");
  }

  lines.push("");
  if (observation.visibleActions.length === 0) {
    lines.push("No visible action candidates. Use click_locator, navigate, or stop.");
  } else {
    lines.push(`Visible action candidates (${observation.visibleActions.length}):`);
    for (const candidate of observation.visibleActions) {
      const role = candidate.role ? ` ${candidate.role}` : "";
      lines.push(
        `  [${candidate.index}]${role} "${candidate.label}" — kind=${candidate.kind} risk=${candidate.risk}`,
      );
    }
  }

  if (observation.recentHistory.length > 0) {
    lines.push("");
    lines.push("Recent history:");
    for (const entry of observation.recentHistory) {
      lines.push(`  #${entry.iteration} ${formatHistoryDecision(entry.decision)} → ${entry.outcome}${entry.note ? ` (${entry.note})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatHistoryDecision(decision: AgentObservation["recentHistory"][number]["decision"]): string {
  switch (decision.kind) {
    case "click_candidate":
      return `click_candidate(${decision.index})`;
    case "click_locator":
      return `click_locator("${decision.label}")`;
    case "navigate":
      return `navigate(${decision.url})`;
    case "stop":
      return `stop(${decision.reason})`;
  }
}
