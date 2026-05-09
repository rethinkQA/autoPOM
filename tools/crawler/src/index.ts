/**
 * @playwright-elements/crawler — public API.
 *
 * Runtime crawler that discovers groups and containers on a live
 * page and emits a JSON manifest for page object generation.
 */

// ── Core crawling ───────────────────────────────────────────

export { crawlPage, diffPage } from "./crawler.js";

// ── Discovery (low-level) ───────────────────────────────────

export { discoverGroups, discoverToasts, GROUP_SELECTOR } from "./discover.js";

// ── Manifest operations ─────────────────────────────────────

export { mergeManifest, diffManifest, mergeKey } from "./merge.js";

// ── Network observation ─────────────────────────────────────

export { observeNetwork, NetworkObserver } from "./network.js";

// ── DOM Flight Recorder (Phase 14) ─────────────────────────

export { DomRecorder } from "./recorder.js";
export type { PageRecording } from "./recorder.js";
export { recordPage } from "./record-api.js";

// ── Page Object Emitter (Phase 12) ─────────────────────────

export {
  emitPageObject,
  emitMultiRoute,
  emitTemplate,
  computeShape,
  detectTemplates,
} from "./emitter.js";

export { diffPageObjects, formatEmitterDiff } from "./emitter-diff.js";

export { labelToPropertyName, deduplicateNames, inferRouteName, safePathname } from "./naming.js";

// ── Agentic / heuristic exploration ────────────────────────

export { explorePage, exploreWithController, createExplorationGraph, snapshotExplorationState } from "./explore.js";
export {
  PlaywrightBrowserController,
  selectLocatorStrategy,
  resolveActionLocator,
} from "./browser-controller.js";
export type { LocatorStrategy, LocatorSelection } from "./browser-controller.js";
export { extractActionCandidates, classifyActionRisk } from "./explore-planner.js";

// ── AI-driven exploration agent (Slice 2) ──────────────────

export { exploreWithAgent } from "./agent-explore.js";
export type {
  IExplorationAgent,
  AgentObservation,
  AgentDecision,
  AgentDecisionSummary,
  AgentCandidate,
  AgentHistoryEntry,
  AgentOutcome,
  AgentExploreOptions,
} from "./agent-types.js";
export {
  createAnthropicAgent,
  extractDecision,
  formatObservationMessage,
  buildAnthropicRequest,
} from "./ai/agent-anthropic.js";
export type {
  AnthropicAgentOptions,
  AnthropicAgentUsage,
  AnthropicRequestBody,
  AnthropicRequestConfig,
} from "./ai/agent-anthropic.js";

// ── MCP-backed browser controller (Slice 1) ────────────────

export { McpBrowserController, targetFromHint, elementDescription } from "./mcp-controller.js";
export type {
  IMcpClient,
  McpToolCall,
  McpControllerOptions,
} from "./mcp-controller.js";
export { createMcpController } from "./mcp-factory.js";
export type {
  CreateMcpControllerOptions,
  McpControllerHandle,
} from "./mcp-factory.js";

// ── Replay-based drift detection ────────────────────────────

export {
  validateExplorationGraph,
  loadExplorationGraph,
  loadBaselineManifests,
  planReplayPaths,
  replayGraph,
  formatDriftReport,
  hasResolvableLocator,
  GraphValidationError,
} from "./replay.js";

export type {
  DriftReport,
  ManifestDriftResult,
  ReplayPath,
  ReplayPathResult,
  ReplayPathStatus,
  ReplayFailure,
  ReplayOptions,
  PlanReplayOptions,
  BaselinePresence,
} from "./replay.js";

// ── Types ───────────────────────────────────────────────────

export type {
  CrawlerManifest,
  ManifestGroup,
  ManifestDiff,
  CrawlOptions,
  GroupType,
  WrapperType,
  Visibility,
  ApiDependency,
  ApiTiming,
  RecordOptions,
} from "./types.js";

export type {
  IBrowserController,
} from "./browser-controller.js";

export type {
  ExploreOptions,
  ExploreResult,
  ExploreStrategy,
  ExplorationAction,
  ExplorationActionCandidate,
  ExplorationActionKind,
  ExplorationActionRisk,
  ExplorationActionStatus,
  ExplorationGraph,
  ExplorationState,
  ExplorationTransition,
  ActionLocatorHint,
} from "./explore-types.js";

export type {
  EmitOptions,
  RouteManifest,
  ShapeEntry,
  DetectedTemplate,
  EmitterDiff,
  EmitterConfig,
} from "./emitter-types.js";

// ── AI-powered discovery ────────────────────────────────────

export { discoverGroupsWithAi, createAiProvider, capturePageContext } from "./ai/index.js";

export type {
  AiProvider,
  AiProviderConfig,
  AiProviderName,
  AiDiscoveredGroup,
  AiPageInput,
} from "./ai/types.js";
