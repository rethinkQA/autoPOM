/**
 * Deterministic exploration graph replay and drift detection.
 *
 * The replay engine consumes a previously recorded `ExplorationGraph`,
 * re-walks every successful action path from the original `startUrl`, rescans
 * the reached state with the existing crawler discovery pipeline, and compares
 * the freshly observed groups + API dependencies against baseline route
 * manifests written by `pw-crawl explore`.
 *
 * The output is a deterministic `DriftReport` — useful both for CI (exit
 * non-zero on structural or manifest drift) and for assisted-repair flows that
 * may layer on top later.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IBrowserController } from "./browser-controller.js";
import { crawlPage } from "./crawler.js";
import type {
  ActionLocatorHint,
  ExplorationAction,
  ExplorationActionKind,
  ExplorationGraph,
  ExplorationState,
  ExplorationTransition,
  ExploreStrategy,
} from "./explore-types.js";
import { diffManifest, mergeKey } from "./merge.js";
import { normalizeRoute, safePathname } from "./naming.js";
import type { AiProvider } from "./ai/types.js";
import type {
  ApiDependency,
  CrawlerManifest,
  ManifestDiff,
  ManifestGroup,
} from "./types.js";

// ── Public types ────────────────────────────────────────────

/** A planned replay path from the graph's initial state to a target state. */
export interface ReplayPath {
  /** State id reached after the actions are replayed. */
  targetStateId: string;

  /** Route template the target state belongs to. */
  routeTemplate: string;

  /** Successful actions that, when replayed in order, lead to `targetStateId`. */
  actions: ExplorationAction[];
}

/** Why a planned replay path failed, if it failed. */
export interface ReplayFailure {
  /** Action id where the replay aborted. */
  actionId: string;

  /** Action label for human display. */
  actionLabel: string;

  /** Action kind. */
  actionKind: ExplorationActionKind;

  /** Error message captured from the controller. */
  reason: string;
}

/** Status of an individual replay path. */
export type ReplayPathStatus = "completed" | "failed";

/** Result of replaying one planned path. */
export interface ReplayPathResult {
  /** Target state id (from the planned path). */
  targetStateId: string;

  /** Route template of the target state (from the planned path). */
  routeTemplate: string;

  /** Replayed action ids in order. */
  actionIds: string[];

  /** Replay outcome. */
  status: ReplayPathStatus;

  /** Failure details when `status === "failed"`. */
  failure?: ReplayFailure;
}

/** Whether a baseline manifest existed for a given route template. */
export type BaselinePresence = "present" | "missing";

/** Manifest-level drift result for a single route template. */
export interface ManifestDriftResult {
  /** Route template the result describes. */
  routeTemplate: string;

  /** Whether a baseline manifest was loaded for this route. */
  baseline: BaselinePresence;

  /** Group diff between live state and baseline (only when baseline === present). */
  diff?: ManifestDiff;

  /** API dependencies present live but missing from baseline. */
  apiDependenciesAdded: ApiDependency[];

  /** API dependencies present in baseline but not observed live. */
  apiDependenciesRemoved: ApiDependency[];
}

/** Aggregated, deterministic drift report. */
export interface DriftReport {
  /** Start URL that exploration and replay both used. */
  startUrl: string;

  /** Strategy recorded in the graph. */
  strategy: ExploreStrategy;

  /** Path-level replay results, sorted by target state id. */
  paths: ReplayPathResult[];

  /** Manifest drift results, sorted by route template. */
  manifests: ManifestDriftResult[];

  /** True when no drift was detected (no failed path, no manifest changes). */
  unchanged: boolean;

  /** Counters for quick CI summaries. */
  summary: {
    pathsAttempted: number;
    pathsCompleted: number;
    pathsFailed: number;
    actionsReplayed: number;
    actionsFailed: number;
    routesCompared: number;
    routesWithGroupDrift: number;
    routesWithApiDrift: number;
    routesMissingBaseline: number;
  };
}

/** Options for {@link planReplayPaths}. */
export interface PlanReplayOptions {
  /** Maximum number of paths to plan (after sorting). Unlimited when omitted. */
  maxPaths?: number;
}

/** Options for {@link replayGraph}. */
export interface ReplayOptions {
  /** Optional baseline manifests keyed by route template. */
  baselines?: Map<string, CrawlerManifest>;

  /** Limit replay rescans to this CSS scope. */
  scope?: string;

  /** Whether to observe network during rescans. Defaults to true. */
  observeNetwork?: boolean;

  /** Optional AI provider used by the existing discovery pipeline. */
  aiProvider?: AiProvider;

  /** Limit the number of paths replayed (after planning). */
  maxPaths?: number;
}

// ── Graph loading and validation ────────────────────────────

/** Error thrown when an exploration graph fails schema validation. */
export class GraphValidationError extends Error {
  constructor(message: string, public readonly source?: string) {
    super(source ? `${source}: ${message}` : message);
    this.name = "GraphValidationError";
  }
}

const ALLOWED_STRATEGIES: readonly ExploreStrategy[] = ["conservative", "balanced", "aggressive"];
const ALLOWED_ACTION_KINDS: readonly ExplorationActionKind[] = [
  "click",
  "fill",
  "select",
  "press",
  "hover",
  "navigate",
  "submit",
];
const ALLOWED_ACTION_STATUSES = new Set(["candidate", "attempted", "succeeded", "failed", "skipped"]);

/**
 * Validate a parsed JSON value as an `ExplorationGraph`. Throws
 * `GraphValidationError` on the first structural problem.
 */
export function validateExplorationGraph(data: unknown, source?: string): ExplorationGraph {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GraphValidationError("graph must be a JSON object", source);
  }

  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    throw new GraphValidationError(
      `unsupported schemaVersion ${String(obj.schemaVersion)} (expected 1)`,
      source,
    );
  }

  if (typeof obj.startUrl !== "string" || obj.startUrl.length === 0) {
    throw new GraphValidationError("startUrl must be a non-empty string", source);
  }

  if (typeof obj.strategy !== "string" || !ALLOWED_STRATEGIES.includes(obj.strategy as ExploreStrategy)) {
    throw new GraphValidationError(`strategy must be one of ${ALLOWED_STRATEGIES.join(", ")}`, source);
  }

  if (!Array.isArray(obj.states)) throw new GraphValidationError("states must be an array", source);
  if (!Array.isArray(obj.actions)) throw new GraphValidationError("actions must be an array", source);
  if (!Array.isArray(obj.transitions)) throw new GraphValidationError("transitions must be an array", source);

  const stateIds = new Set<string>();
  for (const [index, raw] of obj.states.entries()) {
    const state = validateState(raw, index, source);
    if (stateIds.has(state.id)) {
      throw new GraphValidationError(`duplicate state id "${state.id}"`, source);
    }
    stateIds.add(state.id);
  }

  const actionIds = new Set<string>();
  for (const [index, raw] of obj.actions.entries()) {
    const action = validateAction(raw, index, stateIds, source);
    if (actionIds.has(action.id)) {
      throw new GraphValidationError(`duplicate action id "${action.id}"`, source);
    }
    actionIds.add(action.id);
  }

  for (const [index, raw] of obj.transitions.entries()) {
    validateTransition(raw, index, stateIds, actionIds, source);
  }

  return obj as unknown as ExplorationGraph;
}

function validateState(raw: unknown, index: number, source?: string): ExplorationState {
  if (!raw || typeof raw !== "object") {
    throw new GraphValidationError(`states[${index}] must be an object`, source);
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) {
    throw new GraphValidationError(`states[${index}].id must be a non-empty string`, source);
  }
  if (typeof s.routeTemplate !== "string") {
    throw new GraphValidationError(`states[${index}].routeTemplate must be a string`, source);
  }
  if (typeof s.url !== "string") {
    throw new GraphValidationError(`states[${index}].url must be a string`, source);
  }
  if (!Array.isArray(s.manifestGroupKeys)) {
    throw new GraphValidationError(`states[${index}].manifestGroupKeys must be an array`, source);
  }
  return raw as ExplorationState;
}

function validateAction(
  raw: unknown,
  index: number,
  stateIds: Set<string>,
  source?: string,
): ExplorationAction {
  if (!raw || typeof raw !== "object") {
    throw new GraphValidationError(`actions[${index}] must be an object`, source);
  }
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || a.id.length === 0) {
    throw new GraphValidationError(`actions[${index}].id must be a non-empty string`, source);
  }
  if (typeof a.stateId !== "string" || !stateIds.has(a.stateId)) {
    throw new GraphValidationError(`actions[${index}].stateId references unknown state "${String(a.stateId)}"`, source);
  }
  if (typeof a.kind !== "string" || !ALLOWED_ACTION_KINDS.includes(a.kind as ExplorationActionKind)) {
    throw new GraphValidationError(`actions[${index}].kind must be one of ${ALLOWED_ACTION_KINDS.join(", ")}`, source);
  }
  if (typeof a.label !== "string") {
    throw new GraphValidationError(`actions[${index}].label must be a string`, source);
  }
  if (typeof a.status !== "string" || !ALLOWED_ACTION_STATUSES.has(a.status)) {
    throw new GraphValidationError(`actions[${index}].status is invalid`, source);
  }
  if (!a.locator || typeof a.locator !== "object") {
    throw new GraphValidationError(`actions[${index}].locator must be an object`, source);
  }
  return raw as ExplorationAction;
}

function validateTransition(
  raw: unknown,
  index: number,
  stateIds: Set<string>,
  actionIds: Set<string>,
  source?: string,
): ExplorationTransition {
  if (!raw || typeof raw !== "object") {
    throw new GraphValidationError(`transitions[${index}] must be an object`, source);
  }
  const t = raw as Record<string, unknown>;
  if (typeof t.fromStateId !== "string" || !stateIds.has(t.fromStateId)) {
    throw new GraphValidationError(`transitions[${index}].fromStateId references unknown state "${String(t.fromStateId)}"`, source);
  }
  if (typeof t.actionId !== "string" || !actionIds.has(t.actionId)) {
    throw new GraphValidationError(`transitions[${index}].actionId references unknown action "${String(t.actionId)}"`, source);
  }
  if (t.toStateId !== undefined && (typeof t.toStateId !== "string" || !stateIds.has(t.toStateId))) {
    throw new GraphValidationError(`transitions[${index}].toStateId references unknown state "${String(t.toStateId)}"`, source);
  }
  return raw as ExplorationTransition;
}

/** Read and validate an exploration graph from disk. */
export async function loadExplorationGraph(filePath: string): Promise<ExplorationGraph> {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new GraphValidationError(`graph file not found: ${absolute}`);
  }
  const raw = await readFile(absolute, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new GraphValidationError(`invalid JSON: ${(err as Error).message}`, absolute);
  }
  return validateExplorationGraph(parsed, absolute);
}

/**
 * Load every `*.manifest.json` file in `dir` and key them by their declared
 * route template (falling back to `manifest.url`).
 */
export async function loadBaselineManifests(dir: string): Promise<Map<string, CrawlerManifest>> {
  const absolute = resolve(dir);
  if (!existsSync(absolute)) {
    throw new GraphValidationError(`baseline manifest directory not found: ${absolute}`);
  }

  const entries = await readdir(absolute);
  const manifestFiles = entries.filter((name) => name.endsWith(".manifest.json")).sort();

  const baselines = new Map<string, CrawlerManifest>();
  for (const fileName of manifestFiles) {
    const filePath = join(absolute, fileName);
    const raw = await readFile(filePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new GraphValidationError(`invalid JSON: ${(err as Error).message}`, filePath);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { groups?: unknown }).groups)) {
      throw new GraphValidationError(`baseline manifest is missing "groups" array`, filePath);
    }
    const manifest = parsed as CrawlerManifest;
    const key = manifest.routeTemplate ?? manifest.url;
    baselines.set(key, manifest);
  }

  return baselines;
}

// ── Replay path planning ────────────────────────────────────

/**
 * Compute deterministic replay paths from the graph's initial state to every
 * other reachable state, following only `succeeded` actions whose transitions
 * landed in a recorded state. Paths are sorted by `(routeTemplate, length,
 * targetStateId)` to keep CI output stable.
 */
export function planReplayPaths(
  graph: ExplorationGraph,
  options: PlanReplayOptions = {},
): ReplayPath[] {
  if (graph.states.length === 0) return [];

  const stateById = new Map<string, ExplorationState>();
  for (const state of graph.states) stateById.set(state.id, state);

  const actionsById = new Map<string, ExplorationAction>();
  for (const action of graph.actions) actionsById.set(action.id, action);

  // Group successful transitions by source state, sorted by action id for
  // deterministic traversal order.
  const outgoing = new Map<string, ExplorationTransition[]>();
  for (const transition of graph.transitions) {
    const action = actionsById.get(transition.actionId);
    if (!action || action.status !== "succeeded") continue;
    if (!transition.toStateId || transition.toStateId === transition.fromStateId) continue;

    const list = outgoing.get(transition.fromStateId) ?? [];
    list.push(transition);
    outgoing.set(transition.fromStateId, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.actionId.localeCompare(b.actionId));
  }

  const initial = pickInitialState(graph, stateById);
  if (!initial) return [];

  const shortest = new Map<string, ExplorationAction[]>();
  shortest.set(initial.id, []);

  const queue: { stateId: string; path: ExplorationAction[] }[] = [{ stateId: initial.id, path: [] }];
  while (queue.length > 0) {
    const { stateId, path } = queue.shift()!;
    const transitions = outgoing.get(stateId) ?? [];
    for (const transition of transitions) {
      const target = transition.toStateId!;
      if (shortest.has(target)) continue;
      const action = actionsById.get(transition.actionId)!;
      const nextPath = [...path, action];
      shortest.set(target, nextPath);
      queue.push({ stateId: target, path: nextPath });
    }
  }

  const paths: ReplayPath[] = [];
  for (const [stateId, path] of shortest) {
    if (path.length === 0) continue; // skip the initial state itself
    const target = stateById.get(stateId)!;
    paths.push({
      targetStateId: stateId,
      routeTemplate: target.routeTemplate,
      actions: path,
    });
  }

  paths.sort((a, b) => {
    if (a.routeTemplate !== b.routeTemplate) return a.routeTemplate.localeCompare(b.routeTemplate);
    if (a.actions.length !== b.actions.length) return a.actions.length - b.actions.length;
    return a.targetStateId.localeCompare(b.targetStateId);
  });

  if (options.maxPaths !== undefined && options.maxPaths >= 0) {
    return paths.slice(0, options.maxPaths);
  }
  return paths;
}

function pickInitialState(
  graph: ExplorationGraph,
  stateById: Map<string, ExplorationState>,
): ExplorationState | undefined {
  // Prefer an explicit root: a state whose route template matches `startUrl`
  // and that has no incoming transition.
  const incoming = new Set<string>();
  for (const transition of graph.transitions) {
    if (transition.toStateId) incoming.add(transition.toStateId);
  }

  const startTemplate = normalizeRoute(graph.startUrl).page;
  const roots = graph.states.filter((state) => !incoming.has(state.id));
  const matchingRoot = roots.find((state) => state.routeTemplate === startTemplate);
  if (matchingRoot) return matchingRoot;
  if (roots.length > 0) return roots[0];
  return stateById.get(graph.states[0].id);
}

// ── Replay engine ───────────────────────────────────────────

/**
 * Replay a saved exploration graph using `controller`, rescan each reached
 * state with the existing crawler discovery pipeline, and produce a
 * deterministic drift report.
 */
export async function replayGraph(
  controller: IBrowserController,
  graph: ExplorationGraph,
  options: ReplayOptions = {},
): Promise<DriftReport> {
  const paths = planReplayPaths(graph, { maxPaths: options.maxPaths });
  const baselines = options.baselines ?? new Map<string, CrawlerManifest>();

  const liveGroupsByRoute = new Map<string, Map<string, ManifestGroup>>();
  const liveApiByRoute = new Map<string, Map<string, ApiDependency>>();
  const visitedRoutes = new Set<string>();
  const pathResults: ReplayPathResult[] = [];
  let actionsReplayed = 0;
  let actionsFailed = 0;

  const initialState = pickInitialState(graph, new Map(graph.states.map((s) => [s.id, s])));
  if (initialState) {
    await controller.goto(graph.startUrl);
    await mergeLiveScan(
      controller,
      initialState.routeTemplate,
      liveGroupsByRoute,
      liveApiByRoute,
      visitedRoutes,
      options,
    );
  }

  for (const path of paths) {
    const result = await replaySinglePath(
      controller,
      path,
      graph.startUrl,
      liveGroupsByRoute,
      liveApiByRoute,
      visitedRoutes,
      options,
    );
    pathResults.push(result.outcome);
    actionsReplayed += result.actionsReplayed;
    actionsFailed += result.actionsFailed;
  }

  pathResults.sort((a, b) => a.targetStateId.localeCompare(b.targetStateId));

  const manifestResults = computeManifestDrift(
    baselines,
    liveGroupsByRoute,
    liveApiByRoute,
    visitedRoutes,
  );

  const pathsCompleted = pathResults.filter((p) => p.status === "completed").length;
  const pathsFailed = pathResults.length - pathsCompleted;
  const routesWithGroupDrift = manifestResults.filter(
    (r) => r.diff !== undefined && r.diff.unchanged === false,
  ).length;
  const routesWithApiDrift = manifestResults.filter(
    (r) => r.apiDependenciesAdded.length > 0 || r.apiDependenciesRemoved.length > 0,
  ).length;
  const routesMissingBaseline = manifestResults.filter((r) => r.baseline === "missing").length;

  return {
    startUrl: graph.startUrl,
    strategy: graph.strategy,
    paths: pathResults,
    manifests: manifestResults,
    unchanged:
      pathsFailed === 0 &&
      routesWithGroupDrift === 0 &&
      routesWithApiDrift === 0 &&
      routesMissingBaseline === 0,
    summary: {
      pathsAttempted: pathResults.length,
      pathsCompleted,
      pathsFailed,
      actionsReplayed,
      actionsFailed,
      routesCompared: manifestResults.length,
      routesWithGroupDrift,
      routesWithApiDrift,
      routesMissingBaseline,
    },
  };
}

async function replaySinglePath(
  controller: IBrowserController,
  path: ReplayPath,
  startUrl: string,
  liveGroupsByRoute: Map<string, Map<string, ManifestGroup>>,
  liveApiByRoute: Map<string, Map<string, ApiDependency>>,
  visitedRoutes: Set<string>,
  options: ReplayOptions,
): Promise<{ outcome: ReplayPathResult; actionsReplayed: number; actionsFailed: number }> {
  const actionIds = path.actions.map((a) => a.id);
  let actionsReplayed = 0;
  let actionsFailed = 0;

  await controller.goto(startUrl);

  for (const action of path.actions) {
    try {
      await controller.perform(action);
      await controller.waitForSettled();
      actionsReplayed++;
    } catch (err) {
      actionsFailed++;
      const reason = err instanceof Error ? err.message : String(err);
      return {
        outcome: {
          targetStateId: path.targetStateId,
          routeTemplate: path.routeTemplate,
          actionIds,
          status: "failed",
          failure: {
            actionId: action.id,
            actionLabel: action.label,
            actionKind: action.kind,
            reason,
          },
        },
        actionsReplayed,
        actionsFailed,
      };
    }
  }

  const observedTemplate = inferRouteFromController(controller, path.routeTemplate);
  await mergeLiveScan(
    controller,
    observedTemplate,
    liveGroupsByRoute,
    liveApiByRoute,
    visitedRoutes,
    options,
  );

  return {
    outcome: {
      targetStateId: path.targetStateId,
      routeTemplate: path.routeTemplate,
      actionIds,
      status: "completed",
    },
    actionsReplayed,
    actionsFailed,
  };
}

function inferRouteFromController(controller: IBrowserController, fallback: string): string {
  try {
    return normalizeRoute(controller.currentUrl()).page;
  } catch {
    return fallback;
  }
}

async function mergeLiveScan(
  controller: IBrowserController,
  routeTemplate: string,
  liveGroupsByRoute: Map<string, Map<string, ManifestGroup>>,
  liveApiByRoute: Map<string, Map<string, ApiDependency>>,
  visitedRoutes: Set<string>,
  options: ReplayOptions,
): Promise<void> {
  const manifest = await crawlPage(controller.page(), {
    scope: options.scope,
    pass: 1,
    observeNetwork: options.observeNetwork,
    aiProvider: options.aiProvider,
  });

  visitedRoutes.add(routeTemplate);

  const groupBucket = liveGroupsByRoute.get(routeTemplate) ?? new Map<string, ManifestGroup>();
  for (const group of manifest.groups) {
    const key = mergeKey(group);
    if (!groupBucket.has(key)) groupBucket.set(key, group);
  }
  liveGroupsByRoute.set(routeTemplate, groupBucket);

  if (manifest.apiDependencies && manifest.apiDependencies.length > 0) {
    const apiBucket = liveApiByRoute.get(routeTemplate) ?? new Map<string, ApiDependency>();
    for (const dep of manifest.apiDependencies) {
      const key = `${dep.method}:${dep.pattern}`;
      if (!apiBucket.has(key)) apiBucket.set(key, dep);
    }
    liveApiByRoute.set(routeTemplate, apiBucket);
  }
}

function computeManifestDrift(
  baselines: Map<string, CrawlerManifest>,
  liveGroupsByRoute: Map<string, Map<string, ManifestGroup>>,
  liveApiByRoute: Map<string, Map<string, ApiDependency>>,
  visitedRoutes: Set<string>,
): ManifestDriftResult[] {
  const routes = new Set<string>();
  for (const route of visitedRoutes) routes.add(route);
  for (const route of baselines.keys()) routes.add(route);

  const sortedRoutes = [...routes].sort((a, b) => a.localeCompare(b));
  const results: ManifestDriftResult[] = [];

  for (const routeTemplate of sortedRoutes) {
    const baseline = baselines.get(routeTemplate);
    const liveGroups = liveGroupsByRoute.get(routeTemplate);
    const liveApi = liveApiByRoute.get(routeTemplate);
    const liveGroupList = liveGroups ? sortGroups([...liveGroups.values()]) : [];
    const liveApiList = liveApi ? sortApi([...liveApi.values()]) : [];

    if (!baseline) {
      results.push({
        routeTemplate,
        baseline: "missing",
        apiDependenciesAdded: liveApiList,
        apiDependenciesRemoved: [],
      });
      continue;
    }

    const diff = diffManifest(baseline, liveGroupList);
    const baselineApi = baseline.apiDependencies ?? [];
    const baselineApiKeys = new Set(baselineApi.map((d) => `${d.method}:${d.pattern}`));
    const liveApiKeys = new Set(liveApiList.map((d) => `${d.method}:${d.pattern}`));

    const apiAdded = sortApi(liveApiList.filter((d) => !baselineApiKeys.has(`${d.method}:${d.pattern}`)));
    const apiRemoved = sortApi(baselineApi.filter((d) => !liveApiKeys.has(`${d.method}:${d.pattern}`)));

    results.push({
      routeTemplate,
      baseline: "present",
      diff: {
        added: sortGroups(diff.added),
        removed: sortGroups(diff.removed),
        changed: [...diff.changed].sort((a, b) => a.mergeKey.localeCompare(b.mergeKey)),
        unchanged: diff.unchanged,
      },
      apiDependenciesAdded: apiAdded,
      apiDependenciesRemoved: apiRemoved,
    });
  }

  return results;
}

function sortGroups(groups: ManifestGroup[]): ManifestGroup[] {
  return [...groups].sort((a, b) => mergeKey(a).localeCompare(mergeKey(b)));
}

function sortApi(deps: ApiDependency[]): ApiDependency[] {
  return [...deps].sort((a, b) => {
    const left = `${a.method}:${a.pattern}`;
    const right = `${b.method}:${b.pattern}`;
    return left.localeCompare(right);
  });
}

// ── Drift report formatting ─────────────────────────────────

/** Render a `DriftReport` as a deterministic, human-readable string. */
export function formatDriftReport(report: DriftReport): string {
  const lines: string[] = [];
  lines.push(report.unchanged
    ? "✓ Replay drift check passed — no structural or manifest drift detected."
    : "⚠ Replay drift detected.");
  lines.push("");
  lines.push(`Start URL : ${report.startUrl}`);
  lines.push(`Strategy  : ${report.strategy}`);
  lines.push(
    `Paths     : ${report.summary.pathsCompleted}/${report.summary.pathsAttempted} completed` +
    (report.summary.pathsFailed > 0 ? ` (${report.summary.pathsFailed} failed)` : ""),
  );
  lines.push(
    `Actions   : ${report.summary.actionsReplayed} replayed` +
    (report.summary.actionsFailed > 0 ? `, ${report.summary.actionsFailed} failed` : ""),
  );
  lines.push(
    `Routes    : ${report.summary.routesCompared} compared, ` +
    `${report.summary.routesWithGroupDrift} with group drift, ` +
    `${report.summary.routesWithApiDrift} with API drift, ` +
    `${report.summary.routesMissingBaseline} missing baseline`,
  );

  const failedPaths = report.paths.filter((p) => p.status === "failed");
  if (failedPaths.length > 0) {
    lines.push("");
    lines.push(`Failed paths (${failedPaths.length}):`);
    for (const path of failedPaths) {
      const failure = path.failure;
      lines.push(`  ✗ ${path.targetStateId} (${path.routeTemplate})`);
      if (failure) {
        lines.push(`      action: ${failure.actionKind} "${failure.actionLabel}" (${failure.actionId})`);
        lines.push(`      reason: ${failure.reason}`);
      }
    }
  }

  for (const result of report.manifests) {
    if (result.baseline === "missing") {
      lines.push("");
      lines.push(`Missing baseline for ${result.routeTemplate}.`);
      if (result.apiDependenciesAdded.length > 0) {
        lines.push(`  API dependencies seen live (${result.apiDependenciesAdded.length}):`);
        for (const dep of result.apiDependenciesAdded) {
          lines.push(`    + ${dep.method} ${dep.pattern}`);
        }
      }
      continue;
    }

    const diff = result.diff!;
    const apiDrift = result.apiDependenciesAdded.length > 0 || result.apiDependenciesRemoved.length > 0;
    if (diff.unchanged && !apiDrift) continue;

    lines.push("");
    lines.push(`Drift in ${result.routeTemplate}:`);

    if (diff.added.length > 0) {
      lines.push(`  Added (${diff.added.length}):`);
      for (const g of diff.added) {
        lines.push(`    + [${g.wrapperType}] "${g.label}" (${g.selector})`);
      }
    }

    if (diff.removed.length > 0) {
      lines.push(`  Removed (${diff.removed.length}):`);
      for (const g of diff.removed) {
        lines.push(`    - [${g.wrapperType}] "${g.label}" (${g.selector})`);
      }
    }

    if (diff.changed.length > 0) {
      lines.push(`  Changed (${diff.changed.length}):`);
      for (const c of diff.changed) {
        lines.push(`    ~ "${c.before.label}" → "${c.after.label}" (${c.mergeKey})`);
      }
    }

    if (result.apiDependenciesAdded.length > 0) {
      lines.push(`  API added (${result.apiDependenciesAdded.length}):`);
      for (const dep of result.apiDependenciesAdded) {
        lines.push(`    + ${dep.method} ${dep.pattern}`);
      }
    }

    if (result.apiDependenciesRemoved.length > 0) {
      lines.push(`  API removed (${result.apiDependenciesRemoved.length}):`);
      for (const dep of result.apiDependenciesRemoved) {
        lines.push(`    - ${dep.method} ${dep.pattern}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ── Misc utilities re-exported for CLI use ──────────────────

/** Convert a graph route template to a stable manifest filename stem. */
export function manifestFileStemForRoute(routeTemplate: string): string {
  return safePathname(routeTemplate).replace(/\W+/g, "-").replace(/^-+|-+$/g, "") || "home";
}

/** Type guard re-exported so callers can validate `ActionLocatorHint` shapes. */
export function hasResolvableLocator(hint: ActionLocatorHint): boolean {
  return Boolean(
    (hint.role && hint.name) ||
      hint.label ||
      hint.testId ||
      hint.text ||
      hint.selector,
  );
}
