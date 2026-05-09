/**
 * Exploration types — durable graph produced by agentic/heuristic crawling.
 *
 * The exploration graph records how UI states were reached. Manifests remain
 * the source of truth for page object generation; the graph is the replayable
 * audit trail used for deeper discovery and future drift checks.
 */

import type { AiProvider } from "./ai/types.js";
import type { ApiDependency, CrawlerManifest } from "./types.js";

// ── Strategy and options ────────────────────────────────────

/** Exploration safety strategy. */
export type ExploreStrategy = "conservative" | "balanced" | "aggressive";

/** Action kinds that the exploration graph can represent. */
export type ExplorationActionKind = "click" | "fill" | "select" | "press" | "hover" | "navigate" | "submit";

/** Risk classification for a candidate or attempted action. */
export type ExplorationActionRisk = "safe" | "navigation" | "mutation" | "destructive" | "unknown";

/** Lifecycle status for an action recorded in the exploration graph. */
export type ExplorationActionStatus = "candidate" | "attempted" | "succeeded" | "failed" | "skipped";

/** Options for autonomous exploration. */
export interface ExploreOptions {
  /** Limit discovery and action extraction to a CSS selector. */
  scope?: string;

  /** Maximum action depth from the initial URL (default: 2). */
  maxDepth?: number;

  /** Maximum attempted actions across the run (default: 20). */
  maxActions?: number;

  /** Maximum distinct route templates to enqueue for deeper exploration (default: 10). */
  maxRoutes?: number;

  /** Maximum rescans per route template (reserved for future use, default: 2). */
  maxRescans?: number;

  /** Safety strategy for action filtering (default: "conservative"). */
  strategy?: ExploreStrategy;

  /** Whether to observe page-load/network dependencies while scanning states (default: true). */
  observeNetwork?: boolean;

  /** Optional AI provider used by the existing discovery pipeline. */
  aiProvider?: AiProvider;

  /** Additional label patterns to deny even in aggressive mode. */
  denyActionPatterns?: RegExp[];

  /** Label patterns that should be treated as safe. */
  allowActionPatterns?: RegExp[];
}

// ── Locator and action records ──────────────────────────────

/** Replayable locator identity for an explored action. */
export interface ActionLocatorHint {
  /** ARIA role, when available. */
  role?: string;

  /** Accessible name or visible label. */
  name?: string;

  /** Label text associated with the control. */
  label?: string;

  /** Visible text fallback. */
  text?: string;

  /** Test id fallback. */
  testId?: string;

  /** CSS selector fallback. */
  selector?: string;

  /** Link href, when action is navigation. */
  href?: string;

  /** Whether href points to the same origin as the current page. */
  isInternalHref?: boolean;
}

/** Action proposed by a planner before it is persisted as an attempted action. */
export interface ExplorationActionCandidate {
  /** Action kind to perform. */
  kind: ExplorationActionKind;

  /** Human-readable action label. */
  label: string;

  /** Replayable locator identity. */
  locator: ActionLocatorHint;

  /** Planner reason for trying the action. */
  reason: string;

  /** Risk classification. */
  risk: ExplorationActionRisk;

  /** Stable signature used for deduplication within a state. */
  signature: string;
}

/** Persisted action record in an exploration graph. */
export interface ExplorationAction extends ExplorationActionCandidate {
  /** Unique action id. */
  id: string;

  /** State where this action was proposed/executed. */
  stateId: string;

  /** Execution status. */
  status: ExplorationActionStatus;

  /** ISO timestamp when this action was attempted, skipped, or recorded. */
  timestamp: string;

  /** Error message for failed actions. */
  error?: string;
}

// ── State and transition records ────────────────────────────

/** Browser state observed during exploration. */
export interface ExplorationState {
  /** Unique state id. */
  id: string;

  /** Full browser URL. */
  url: string;

  /** Normalized route template (dynamic segments collapsed). */
  routeTemplate: string;

  /** URL pathname as observed. */
  pathname: string;

  /** Document title. */
  title: string;

  /** Stable hash of normalized DOM. */
  domHash: string;

  /** Stable hash of ARIA snapshot. */
  ariaHash: string;

  /** Stable hash of visible action signatures. */
  actionHash: string;

  /** Number of visible action candidates. */
  visibleActionCount: number;

  /** Manifest group keys seen in this state. */
  manifestGroupKeys: string[];

  /** ISO timestamp when observed. */
  discoveredAt: string;

  /** Action id that entered this state, if any. */
  enteredByActionId?: string;
}

/** Transition produced by attempting one action. */
export interface ExplorationTransition {
  /** Previous state id. */
  fromStateId: string;

  /** Action id that produced the transition. */
  actionId: string;

  /** Resulting state id, if the action succeeded far enough to rescan. */
  toStateId?: string;

  /** Whether the action changed URL. */
  navigation: boolean;

  /** Manifest merge keys newly introduced by this transition. */
  newGroups: string[];

  /** API dependencies observed during the action. */
  newApiDependencies: ApiDependency[];

  /** Error messages observed while attempting the transition. */
  errors: string[];
}

/** Durable graph that records how manifests were discovered. */
export interface ExplorationGraph {
  /** Schema version for future graph migrations. */
  schemaVersion: number;

  /** Initial URL passed to exploration. */
  startUrl: string;

  /** Exploration strategy used. */
  strategy: ExploreStrategy;

  /** ISO timestamp when exploration started. */
  startedAt: string;

  /** ISO timestamp when exploration finished. */
  finishedAt?: string;

  /** States observed during exploration. */
  states: ExplorationState[];

  /** Actions considered/attempted during exploration. */
  actions: ExplorationAction[];

  /** Transitions between states. */
  transitions: ExplorationTransition[];

  /** Summary counters. */
  summary: {
    attemptedActions: number;
    succeededActions: number;
    failedActions: number;
    skippedActions: number;
    routeCount: number;
  };
}

/** Result returned by `explorePage()`. */
export interface ExploreResult {
  /** Replayable exploration graph. */
  graph: ExplorationGraph;

  /** Route template -> merged manifest. */
  manifests: Map<string, CrawlerManifest>;
}
