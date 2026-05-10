/**
 * AI exploration agent — types.
 *
 * The agent picks the next exploration action; the controller (Playwright or
 * MCP) executes it. Decisions translate into existing `ExplorationAction`
 * records so the manifest/graph pipeline stays unchanged.
 */

import type {
  ActionLocatorHint,
  ExplorationActionKind,
  ExplorationActionRisk,
} from "./explore-types.js";

// ── What the agent sees each turn ───────────────────────────

/** A candidate offered to the agent for selection by index. */
export interface AgentCandidate {
  /** Stable index within this observation. */
  index: number;

  /** Action kind the candidate would produce. */
  kind: ExplorationActionKind;

  /** Visible label / accessible name. */
  label: string;

  /** Optional ARIA role. */
  role?: string;

  /** Risk classification from the heuristic planner. */
  risk: ExplorationActionRisk;

  /** Stable signature used to deduplicate within a state. */
  signature: string;
}

/** Outcome of a previous agent decision, surfaced back to the model. */
export type AgentOutcome = "success" | "failed" | "navigated" | "no_change" | "stopped";

/** One row of recent decision history. */
export interface AgentHistoryEntry {
  /** Iteration the entry was produced in. */
  iteration: number;

  /** Compact summary of what the agent chose. */
  decision: AgentDecisionSummary;

  /** What actually happened. */
  outcome: AgentOutcome;

  /** Optional human-readable note (e.g. error message). */
  note?: string;
}

/** Compact form of an agent decision used in history entries. */
export type AgentDecisionSummary =
  | { kind: "click_candidate"; index: number }
  | { kind: "click_locator"; label: string }
  | { kind: "fill_field"; label: string }
  | { kind: "navigate"; url: string }
  | { kind: "stop"; reason: string };

/** Snapshot the agent inspects before each decision. */
export interface AgentObservation {
  /** Iteration counter (0-based, increments per decision). */
  iteration: number;

  /** Live URL after the previous action. */
  url: string;

  /** Normalized route template. */
  routeTemplate: string;

  /** Document title. */
  title: string;

  /** Manifest group keys discovered for the current state's route. */
  manifestGroupKeys: string[];

  /** Current visible action candidates the agent can pick from. */
  visibleActions: AgentCandidate[];

  /** Recent decisions + outcomes (most-recent last). */
  recentHistory: AgentHistoryEntry[];

  /** Action budget reporting (so the model can pace itself). */
  budget: { actionsRemaining: number; maxActions: number };
}

// ── What the agent returns ──────────────────────────────────

/** A decision the agent emits each turn. */
export type AgentDecision =
  | {
      kind: "click_candidate";
      /** Index into `observation.visibleActions`. */
      index: number;
      /** Optional rationale stored with the action record. */
      rationale?: string;
    }
  | {
      kind: "click_locator";
      /** Custom locator the agent constructed. */
      locator: ActionLocatorHint;
      /** Human-readable label associated with the action. */
      label: string;
      /** Optional rationale. */
      rationale?: string;
    }
  | {
      kind: "fill_field";
      /** Locator for the input field to fill. */
      locator: ActionLocatorHint;
      /**
       * Value to type into the field. May contain `{{KEY}}` placeholders
       * that resolve against the credentials map at dispatch time, so
       * actual credential strings never appear in the agent's output.
       */
      value: string;
      /** Human-readable label for the field. */
      label: string;
      /** Optional rationale. */
      rationale?: string;
    }
  | {
      kind: "navigate";
      /** Absolute URL or path to navigate to. */
      url: string;
      /** Optional rationale. */
      rationale?: string;
    }
  | {
      kind: "stop";
      /** Why the agent decided exploration is complete (or impossible). */
      reason: string;
    };

// ── Agent contract ──────────────────────────────────────────

/** AI agent capable of choosing the next exploration action. */
export interface IExplorationAgent {
  /** Display name (used for logging). */
  readonly name: string;

  /** Pick the next decision given an observation. */
  decide(observation: AgentObservation): Promise<AgentDecision>;
}

// ── Loop options ────────────────────────────────────────────

/**
 * Credentials map injected at dispatch time when the agent emits a
 * `fill_field` value containing `{{KEY}}` placeholders. The agent never
 * sees the actual values — only the keys, surfaced in the system prompt.
 */
export type AgentCredentials = Record<string, string>;

/** Options for {@link exploreWithAgent}. */
export interface AgentExploreOptions {
  /** Limit scanning and action extraction to a CSS selector. */
  scope?: string;

  /** Hard cap on attempted actions (default: 20). */
  maxActions?: number;

  /** Stop after this many consecutive turns where the state did not change (default: 2). */
  maxConsecutiveNoChange?: number;

  /** Whether to observe network during state rescans. */
  observeNetwork?: boolean;

  /** Optional DOM analysis AI provider, layered on top of the agent for richer state observation. */
  aiProvider?: import("./ai/types.js").AiProvider;

  /** Strategy passed through to action extraction (defaults to "balanced" — agent chooses among broader candidates). */
  strategy?: import("./explore-types.js").ExploreStrategy;

  /** Maximum history rows shown to the agent each turn (default: 6). */
  historyLimit?: number;

  /** Custom logger for run-time agent decisions; defaults to no-op. */
  log?: (line: string) => void;

  /**
   * Credentials map for `{{KEY}}` placeholder substitution in `fill_field`
   * decisions. When omitted, fills with placeholders are left as-is.
   */
  credentials?: AgentCredentials;
}
