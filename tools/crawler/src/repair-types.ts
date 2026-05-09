/**
 * Assisted-repair types.
 *
 * When `pw-crawl drift` finds a failed action during replay, the repair pass
 * re-replays the path up to the failure point, gathers current visible
 * candidates, and asks an `IRepairAgent` for a suggested replacement. The
 * suggestions are written to a side file — the original graph and manifests
 * are never silently mutated.
 */

import type {
  ActionLocatorHint,
  ExplorationAction,
  ExplorationActionKind,
} from "./explore-types.js";
import type { AgentCandidate } from "./agent-types.js";

// ── What the repair agent sees ──────────────────────────────

/** Compact summary of the path leading to the failure. */
export interface RepairHistoryEntry {
  /** Action id that succeeded earlier in the path. */
  actionId: string;

  /** Action kind. */
  kind: ExplorationActionKind;

  /** Visible label / accessible name. */
  label: string;
}

/** Snapshot of the page state at the failure point. */
export interface RepairContext {
  /** Failed action record from the saved graph. */
  failedAction: ExplorationAction;

  /** Failure message captured during replay. */
  failureReason: string;

  /** Live URL after the path was replayed up to the failure point. */
  pageUrl: string;

  /** Document title at the failure point. */
  pageTitle: string;

  /** Current visible action candidates (from `extractActionCandidates`). */
  visibleCandidates: AgentCandidate[];

  /** Successful actions that led up to the failure. */
  history: RepairHistoryEntry[];
}

// ── What the repair agent returns ───────────────────────────

/** Decision the agent emits for a single failed action. */
export type RepairDecision =
  | {
      kind: "replace_with_candidate";
      /** Index into `context.visibleCandidates`. */
      index: number;
      /** Optional updated label for the replacement. */
      label?: string;
      rationale: string;
    }
  | {
      kind: "replace_with_locator";
      locator: ActionLocatorHint;
      label: string;
      rationale: string;
    }
  | {
      kind: "give_up";
      reason: string;
    };

/** Repair-agent contract. */
export interface IRepairAgent {
  /** Display name for logging and the suggestion file. */
  readonly name: string;

  /** Produce a repair decision for one failed action. */
  suggest(context: RepairContext): Promise<RepairDecision>;
}

// ── What the repair pass writes ─────────────────────────────

/** A single repair suggestion attached to one failed action. */
export interface RepairSuggestion {
  /** Action id from the saved graph. */
  actionId: string;

  /** State id of the path target the failed action belonged to. */
  pathTargetStateId: string;

  /** Human-readable failure message from the original replay. */
  failureReason: string;

  /** What the saved graph thinks the action does. */
  current: {
    locator: ActionLocatorHint;
    label: string;
    kind: ExplorationActionKind;
  };

  /**
   * Suggested replacement, or `null` if the agent gave up. When non-null,
   * `label` is the new label to record alongside the locator.
   */
  suggested: { locator: ActionLocatorHint; label: string } | null;

  /** Agent rationale or, on give_up, the reason. */
  rationale: string;

  /** Decision kind chosen by the agent. */
  decisionKind: RepairDecision["kind"];
}

/** Top-level repair report written to disk. */
export interface RepairReport {
  /** Schema version for forward-compatible migrations. */
  schemaVersion: 1;

  /** Path of the source graph file (when known). */
  graphFile?: string;

  /** ISO timestamp when the report was produced. */
  generatedAt: string;

  /** Identifier of the agent that produced the suggestions. */
  agent: string;

  /** Suggestions, one per failed action that the engine could re-replay to. */
  suggestions: RepairSuggestion[];

  /** Aggregate counters for quick CI / human summaries. */
  summary: {
    failuresConsidered: number;
    repaired: number;
    gaveUp: number;
    unreachable: number;
  };
}

/** Options for {@link suggestRepairs}. */
export interface SuggestRepairsOptions {
  /** Limit candidate extraction to a CSS scope (mirrors explore/drift). */
  scope?: string;

  /** Path of the saved graph file, surfaced in the report header. */
  graphFile?: string;

  /** Optional logger for per-failure progress. */
  log?: (line: string) => void;
}
