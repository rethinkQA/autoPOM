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
import type {
  IRepairAgent,
  RepairContext,
  RepairDecision,
} from "../repair-types.js";

// ── Configuration ───────────────────────────────────────────

/** Token usage stats reported by Anthropic for a single Messages API call. */
export interface AnthropicAgentUsage {
  /** Non-cached input tokens billed at full rate. */
  inputTokens: number;

  /** Tokens written into the prompt cache during this call (5x base rate). */
  cacheCreationInputTokens: number;

  /** Tokens read from the prompt cache during this call (0.1x base rate). */
  cacheReadInputTokens: number;

  /** Output tokens. */
  outputTokens: number;
}

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

  /**
   * Disable prompt caching. Defaults to false — caching is on so agent loops
   * pay full rate only on the first turn and ~0.1x rate on subsequent turns.
   */
  disablePromptCache?: boolean;

  /** Optional callback invoked once per Messages API call with token usage stats. */
  onUsage?: (usage: AnthropicAgentUsage) => void;

  /**
   * Names of credential placeholders the model can use as `{{KEY}}` values
   * inside `fill_field`. Only the keys are sent — actual values are
   * resolved at dispatch time and never appear in agent output.
   */
  credentialKeys?: string[];
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
- fill_field(locator, value, label): type into an input/textarea (e.g. login email/password)
- navigate(url): jump to a route directly when faster than clicking
- stop(reason): end exploration when no useful actions remain or the surface is fully covered

Rules:
- Never call destructive actions (delete, sign out, purchase, checkout, reset, confirm).
- Prefer actions that uncover new groups, dialogs, menus, or routes.
- Prefer click_candidate when a suitable candidate exists.
- For login/auth pages, fill_field the email/password fields then click_locator the submit button.
- Stop early when you observe consecutive turns with no new groups or no progress.
- Be concise in rationales (one short sentence).`;

const CREDENTIAL_PROMPT_PREFIX = `

Available credential placeholders for fill_field values: `;
const CREDENTIAL_PROMPT_SUFFIX = `
When filling a login/auth form, use these placeholders verbatim as the fill_field value (e.g. value: "{{EMAIL}}"). They are resolved at dispatch time so the actual credentials never appear in your output.`;

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
    name: "fill_field",
    description:
      "Type a value into an input/textarea. Use for login forms, search boxes, and similar fields. Use {{KEY}} placeholders for credentials.",
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
        value: {
          type: "string",
          description: "Text to type. Use {{KEY}} placeholders to refer to credentials by name.",
        },
        label: { type: "string", description: "Human-readable name of the field for logging." },
        rationale: { type: "string" },
      },
      required: ["locator", "value", "label"],
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

/** Cache breakpoint marker. */
type CacheControl = { type: "ephemeral" };

/** Anthropic system block in array form (required for cache_control). */
interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

interface AnthropicMessagesResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Request body shape Anthropic's `/v1/messages` accepts. */
export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: AnthropicSystemBlock[];
  tools: ReadonlyArray<unknown>;
  tool_choice: { type: "auto" } | { type: "tool"; name: string };
  messages: AnthropicMessage[];
}

// ── Agent implementation ────────────────────────────────────

/** Resolved configuration used by {@link buildAnthropicRequest}. */
export interface AnthropicRequestConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  toolChoice: { type: "auto" } | { type: "tool"; name: string };
  enablePromptCache: boolean;
}

/**
 * Build the request body sent to Anthropic's `/v1/messages` for one agent
 * decision. Pure function — extracted so tests can verify the cache_control
 * shape without a live API.
 *
 * Caching strategy: a single `cache_control: ephemeral` breakpoint is placed
 * on the system block. Anthropic caches the cumulative prefix (tools + system
 * up to the breakpoint), which is fully static across turns. Subsequent calls
 * within the cache TTL pay 0.1x base rate for the cached prefix.
 */
export function buildAnthropicRequest(
  observation: AgentObservation,
  config: AnthropicRequestConfig,
): AnthropicRequestBody {
  const systemBlock: AnthropicSystemBlock = {
    type: "text",
    text: config.systemPrompt,
    ...(config.enablePromptCache ? { cache_control: { type: "ephemeral" } as const } : {}),
  };

  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [systemBlock],
    tools: TOOLS,
    tool_choice: config.toolChoice,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: formatObservationMessage(observation) }],
      },
    ],
  };
}

/** Build an Anthropic-backed exploration agent. */
export function createAnthropicAgent(options: AnthropicAgentOptions = {}): IExplorationAgent {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key for anthropic agent. Set ANTHROPIC_API_KEY or pass --ai-key.",
    );
  }
  const baseSystemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const credentialKeys = options.credentialKeys ?? [];
  const systemPrompt = credentialKeys.length > 0
    ? baseSystemPrompt
        + CREDENTIAL_PROMPT_PREFIX
        + credentialKeys.map((k) => `{{${k}}}`).join(", ")
        + CREDENTIAL_PROMPT_SUFFIX
    : baseSystemPrompt;

  const config: AnthropicRequestConfig = {
    model: options.model ?? DEFAULT_MODEL,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    systemPrompt,
    toolChoice: options.toolChoice ?? { type: "auto" },
    enablePromptCache: options.disablePromptCache !== true,
  };
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: `anthropic:${config.model}`,
    async decide(observation: AgentObservation): Promise<AgentDecision> {
      const body = buildAnthropicRequest(observation, config);
      const response = await callAnthropic({ apiKey, baseUrl, body });

      if (options.onUsage && response.usage) {
        options.onUsage({
          inputTokens: response.usage.input_tokens ?? 0,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        });
      }

      const decision = extractDecision(response);
      return decision ?? pickFallback(observation);
    },
  };
}

interface CallArgs {
  apiKey: string;
  baseUrl: string;
  body: AnthropicRequestBody;
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
    case "fill_field": {
      const rawLocator = (input as { locator?: unknown }).locator;
      if (!rawLocator || typeof rawLocator !== "object") return null;
      const locator = sanitizeLocator(rawLocator as Record<string, unknown>);
      const value = stringOrThrow(input, "value");
      const label = stringOrThrow(input, "label");
      const rationale = stringOrUndefined(input, "rationale");
      return { kind: "fill_field", locator, value, label, rationale };
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
    case "fill_field":
      return `fill_field("${decision.label}")`;
    case "navigate":
      return `navigate(${decision.url})`;
    case "stop":
      return `stop(${decision.reason})`;
  }
}

// ── Repair agent (assisted drift refresh) ───────────────────

/** Options for {@link createAnthropicRepairAgent}. */
export interface AnthropicRepairAgentOptions extends Omit<AnthropicAgentOptions, "toolChoice"> {
  /** Optional model-side tool-choice override. */
  toolChoice?: { type: "auto" } | { type: "tool"; name: string };
}

const DEFAULT_REPAIR_SYSTEM_PROMPT = `You suggest a replacement locator for a single failed action during drift replay of a previously-explored web app.

You receive:
- the saved action (label, kind, locator)
- the failure reason (typically a Playwright timeout or selector mismatch)
- the current page URL and title at the failure point
- the visible action candidates currently available, with indices
- the path of successful actions that led up to the failure

Choose exactly one tool:
- replace_with_candidate(index, label?, rationale): pick from visibleCandidates when one of them clearly matches the saved action's intent
- replace_with_locator(locator, label, rationale): construct a fresh locator (role+name preferred) when nothing in the visible list fits
- give_up(reason): no acceptable replacement exists

Rules:
- Prefer replace_with_candidate when a candidate clearly serves the same purpose.
- Prefer role+name locators; only fall back to label/testId/text/selector when no role+name pair is available.
- Do not propose destructive replacements (delete, sign out, purchase, checkout, reset, confirm).
- Keep rationales to one short sentence — focus on why this replacement preserves the original intent.`;

const REPAIR_TOOLS = [
  {
    name: "replace_with_candidate",
    description:
      "Replace the failed action with one of the currently visible candidates by index.",
    input_schema: {
      type: "object",
      properties: {
        index: { type: "integer", minimum: 0 },
        label: { type: "string", description: "Optional updated label to record." },
        rationale: { type: "string" },
      },
      required: ["index", "rationale"],
    },
  },
  {
    name: "replace_with_locator",
    description:
      "Replace the failed action with a custom locator. Prefer role+name; fall back to label, testId, text, or selector.",
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
        label: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["locator", "label", "rationale"],
    },
  },
  {
    name: "give_up",
    description: "No acceptable replacement exists.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
] as const;

/** Resolved configuration used by {@link buildAnthropicRepairRequest}. */
export interface AnthropicRepairRequestConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  toolChoice: { type: "auto" } | { type: "tool"; name: string };
  enablePromptCache: boolean;
}

/**
 * Build the request body for one repair decision. Pure — exported so the
 * cache_control shape is unit-testable without a live API.
 */
export function buildAnthropicRepairRequest(
  context: RepairContext,
  config: AnthropicRepairRequestConfig,
): AnthropicRequestBody {
  const systemBlock: AnthropicSystemBlock = {
    type: "text",
    text: config.systemPrompt,
    ...(config.enablePromptCache ? { cache_control: { type: "ephemeral" } as const } : {}),
  };

  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [systemBlock],
    tools: REPAIR_TOOLS,
    tool_choice: config.toolChoice,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: formatRepairContextMessage(context) }],
      },
    ],
  };
}

/** Build an Anthropic-backed repair agent. */
export function createAnthropicRepairAgent(
  options: AnthropicRepairAgentOptions = {},
): IRepairAgent {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing API key for anthropic repair agent. Set ANTHROPIC_API_KEY or pass --ai-key.",
    );
  }
  const config: AnthropicRepairRequestConfig = {
    model: options.model ?? DEFAULT_MODEL,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    systemPrompt: options.systemPrompt ?? DEFAULT_REPAIR_SYSTEM_PROMPT,
    toolChoice: options.toolChoice ?? { type: "auto" },
    enablePromptCache: options.disablePromptCache !== true,
  };
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: `anthropic-repair:${config.model}`,
    async suggest(context: RepairContext): Promise<RepairDecision> {
      const body = buildAnthropicRepairRequest(context, config);
      const response = await callAnthropic({ apiKey, baseUrl, body });

      if (options.onUsage && response.usage) {
        options.onUsage({
          inputTokens: response.usage.input_tokens ?? 0,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        });
      }

      const decision = extractRepairDecision(response);
      return decision ?? { kind: "give_up", reason: "agent returned no tool_use" };
    },
  };
}

/** Translate Claude's tool_use block into a `RepairDecision`. */
export function extractRepairDecision(
  response: { content: Array<Record<string, unknown>> },
): RepairDecision | null {
  const block = response.content?.find(
    (b): b is { type: "tool_use"; name: string; input: Record<string, unknown> } =>
      b.type === "tool_use" && typeof b.name === "string" && typeof b.input === "object" && b.input !== null,
  );
  if (!block) return null;

  switch (block.name) {
    case "replace_with_candidate": {
      const index = numberOrThrow(block.input, "index");
      const label = stringOrUndefined(block.input, "label");
      const rationale = stringOrUndefined(block.input, "rationale") ?? "";
      return { kind: "replace_with_candidate", index, label, rationale };
    }
    case "replace_with_locator": {
      const rawLocator = (block.input as { locator?: unknown }).locator;
      if (!rawLocator || typeof rawLocator !== "object") return null;
      const locator = sanitizeRepairLocator(rawLocator as Record<string, unknown>);
      const label = stringOrThrow(block.input, "label");
      const rationale = stringOrUndefined(block.input, "rationale") ?? "";
      return { kind: "replace_with_locator", locator, label, rationale };
    }
    case "give_up": {
      const reason = stringOrUndefined(block.input, "reason") ?? "agent gave up without explicit reason";
      return { kind: "give_up", reason };
    }
    default:
      return null;
  }
}

function sanitizeRepairLocator(raw: Record<string, unknown>): ActionLocatorHint {
  const result: ActionLocatorHint = {};
  if (typeof raw.role === "string") result.role = raw.role;
  if (typeof raw.name === "string") result.name = raw.name;
  if (typeof raw.label === "string") result.label = raw.label;
  if (typeof raw.testId === "string") result.testId = raw.testId;
  if (typeof raw.text === "string") result.text = raw.text;
  if (typeof raw.selector === "string") result.selector = raw.selector;
  return result;
}

/** Format a repair context as a single user message. */
export function formatRepairContextMessage(context: RepairContext): string {
  const lines: string[] = [];
  const { failedAction } = context;
  lines.push(`Failed action: ${failedAction.id}`);
  lines.push(`  kind: ${failedAction.kind}`);
  lines.push(`  label: "${failedAction.label}"`);
  lines.push(`  saved locator: ${JSON.stringify(failedAction.locator)}`);
  lines.push(`  failure reason: ${context.failureReason}`);
  lines.push("");
  lines.push(`Current page: ${context.pageUrl}`);
  lines.push(`Title: ${context.pageTitle}`);

  if (context.history.length > 0) {
    lines.push("");
    lines.push(`Path leading to failure (${context.history.length} successful step(s)):`);
    for (const entry of context.history) {
      lines.push(`  - ${entry.actionId} ${entry.kind} "${entry.label}"`);
    }
  }

  lines.push("");
  if (context.visibleCandidates.length === 0) {
    lines.push("No visible action candidates at the failure point. Use replace_with_locator or give_up.");
  } else {
    lines.push(`Visible action candidates (${context.visibleCandidates.length}):`);
    for (const candidate of context.visibleCandidates) {
      const role = candidate.role ? ` ${candidate.role}` : "";
      lines.push(
        `  [${candidate.index}]${role} "${candidate.label}" — kind=${candidate.kind} risk=${candidate.risk}`,
      );
    }
  }

  return lines.join("\n");
}
