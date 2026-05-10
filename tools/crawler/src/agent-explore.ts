/**
 * Agent-driven exploration loop.
 *
 * Replaces the heuristic planner with an `IExplorationAgent` that picks each
 * next action, while the rest of the pipeline (controller dispatch, manifest
 * merge, graph recording) is unchanged. Designed to be transport-agnostic:
 * pair it with `PlaywrightBrowserController` for direct Playwright or
 * `McpBrowserController` for the MCP path.
 *
 * This loop is non-deterministic by nature — meant for nightly/manual runs
 * and assisted-repair flows, not the CI replay path.
 */

import type { IBrowserController } from "./browser-controller.js";
import { crawlPage } from "./crawler.js";
import { extractActionCandidates } from "./explore-planner.js";
import {
  createExplorationGraph,
  snapshotExplorationState,
} from "./explore.js";
import type {
  ExplorationAction,
  ExplorationActionCandidate,
  ExplorationGraph,
  ExplorationState,
  ExplorationTransition,
  ExploreResult,
  ExploreStrategy,
} from "./explore-types.js";
import { mergeKey } from "./merge.js";
import { normalizeRoute } from "./naming.js";
import { NetworkObserver } from "./network.js";
import type { ApiDependency, CrawlerManifest } from "./types.js";
import type {
  AgentCandidate,
  AgentDecision,
  AgentExploreOptions,
  AgentHistoryEntry,
  AgentObservation,
  AgentOutcome,
  IExplorationAgent,
} from "./agent-types.js";

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_MAX_ACTIONS = 20;
const DEFAULT_MAX_NO_CHANGE = 2;
const DEFAULT_HISTORY_LIMIT = 6;
const DEFAULT_STRATEGY: ExploreStrategy = "balanced";

/**
 * Run an agent-driven exploration starting from `startUrl`. Returns the same
 * `ExploreResult` shape as `exploreWithController`, so downstream tooling
 * (manifests, drift replay) can consume either output.
 */
export async function exploreWithAgent(
  controller: IBrowserController,
  agent: IExplorationAgent,
  startUrl: string,
  options: AgentExploreOptions = {},
): Promise<ExploreResult> {
  const strategy = options.strategy ?? DEFAULT_STRATEGY;
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  const maxNoChange = options.maxConsecutiveNoChange ?? DEFAULT_MAX_NO_CHANGE;
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const log = options.log ?? noop;

  const graph = createExplorationGraph(startUrl, strategy);
  const manifests = new Map<string, CrawlerManifest>();
  const stateIdsByKey = new Map<string, string>();
  const history: AgentHistoryEntry[] = [];

  let nextStateNumber = 1;
  let nextActionNumber = 1;
  let consecutiveNoChange = 0;
  let lastStateId: string | undefined;
  let stopped = false;
  let stopReason = "agent did not stop explicitly";

  // ── Initial navigation + scan ────────────────────────────
  await controller.goto(startUrl);
  let currentScan = await scanState(
    controller,
    options,
    strategy,
    graph,
    manifests,
    stateIdsByKey,
    () => `s${nextStateNumber++}`,
    undefined,
  );
  lastStateId = currentScan.state.id;

  // ── Decision loop ────────────────────────────────────────
  for (let iteration = 0; iteration < maxActions; iteration++) {
    const observation = buildObservation(
      iteration,
      currentScan,
      history,
      historyLimit,
      maxActions - iteration,
      maxActions,
    );

    const decision = await agent.decide(observation);
    log(formatDecisionLog(iteration, decision));

    if (decision.kind === "stop") {
      stopped = true;
      stopReason = decision.reason;
      history.push({
        iteration,
        decision: { kind: "stop", reason: decision.reason },
        outcome: "stopped",
      });
      break;
    }

    const resolved = decisionToCandidate(decision, currentScan.candidates, options.credentials);
    if (!resolved) {
      history.push({
        iteration,
        decision: summarizeDecision(decision),
        outcome: "failed",
        note: "decision could not be resolved to a runnable action",
      });
      continue;
    }
    if ("error" in resolved) {
      history.push({
        iteration,
        decision: summarizeDecision(decision),
        outcome: "failed",
        note: resolved.error,
      });
      continue;
    }
    const candidate = resolved.candidate;

    const action = persistAction(graph, candidate, currentScan.state.id, nextActionNumber++, decision);
    graph.summary.attemptedActions++;

    const beforeUrl = controller.currentUrl();
    const beforeKeys = new Set(currentScan.state.manifestGroupKeys);

    const observer = new NetworkObserver(controller.page());
    observer.start();
    observer.setAction(action.label);
    let deps: ApiDependency[] = [];
    let outcome: AgentOutcome = "success";
    let note: string | undefined;

    try {
      await controller.perform(action);
      await controller.waitForSettled();
    } catch (err) {
      action.status = "failed";
      action.error = err instanceof Error ? err.message : String(err);
      graph.summary.failedActions++;
      observer.clearAction();
      deps = observer.stop(Date.now());
      graph.transitions.push({
        fromStateId: action.stateId,
        actionId: action.id,
        navigation: false,
        newGroups: [],
        newApiDependencies: deps,
        errors: [action.error],
      });
      attachApiDependencies(manifests, currentScan.state.routeTemplate, deps);
      history.push({
        iteration,
        decision: summarizeDecision(decision),
        outcome: "failed",
        note: action.error,
      });
      consecutiveNoChange = 0;
      continue;
    }

    observer.clearAction();
    deps = observer.stop(Date.now());

    const nextScan = await scanState(
      controller,
      options,
      strategy,
      graph,
      manifests,
      stateIdsByKey,
      () => `s${nextStateNumber++}`,
      action.id,
    );

    const afterKeys = new Set(nextScan.state.manifestGroupKeys);
    const newGroups = [...afterKeys].filter((key) => !beforeKeys.has(key)).sort();
    const navigation =
      normalizeRoute(beforeUrl).page !== normalizeRoute(controller.currentUrl()).page ||
      beforeUrl !== controller.currentUrl();

    graph.transitions.push({
      fromStateId: action.stateId,
      actionId: action.id,
      toStateId: nextScan.state.id,
      navigation,
      newGroups,
      newApiDependencies: deps,
      errors: [],
    });
    attachApiDependencies(manifests, nextScan.state.routeTemplate, deps);

    action.status = "succeeded";
    graph.summary.succeededActions++;

    const sameState = lastStateId === nextScan.state.id && newGroups.length === 0 && !navigation;
    if (sameState) {
      consecutiveNoChange++;
      outcome = "no_change";
    } else {
      consecutiveNoChange = 0;
      outcome = navigation ? "navigated" : "success";
    }

    history.push({
      iteration,
      decision: summarizeDecision(decision),
      outcome,
      note,
    });

    lastStateId = nextScan.state.id;
    currentScan = nextScan;

    if (consecutiveNoChange >= maxNoChange) {
      stopped = true;
      stopReason = `no progress for ${consecutiveNoChange} consecutive turns`;
      break;
    }
  }

  graph.finishedAt = new Date().toISOString();
  graph.summary.routeCount = new Set(graph.states.map((s) => s.routeTemplate)).size;

  if (!stopped) {
    log(`agent: stopped after exhausting action budget (${maxActions})`);
  } else {
    log(`agent: stopped — ${stopReason}`);
  }

  return { graph, manifests };
}

// ── Internals ───────────────────────────────────────────────

interface CurrentScan {
  state: ExplorationState;
  manifest: CrawlerManifest;
  candidates: ExplorationActionCandidate[];
}

async function scanState(
  controller: IBrowserController,
  options: AgentExploreOptions,
  strategy: ExploreStrategy,
  graph: ExplorationGraph,
  manifests: Map<string, CrawlerManifest>,
  stateIdsByKey: Map<string, string>,
  newStateId: () => string,
  enteredByActionId: string | undefined,
): Promise<CurrentScan> {
  const page = controller.page();
  const snapshot = await snapshotExplorationState(page, enteredByActionId);
  const key = stateKey(snapshot);
  const existingId = stateIdsByKey.get(key);
  const id = existingId ?? newStateId();
  const stateBase: ExplorationState = { ...snapshot, id };

  const previousManifest = manifests.get(stateBase.routeTemplate) ?? null;
  const passNumber = previousManifest ? (previousManifest.passCount ?? 0) + 1 : 1;
  const manifest = await crawlPage(
    page,
    {
      scope: options.scope,
      pass: passNumber,
      observeNetwork: options.observeNetwork,
      aiProvider: options.aiProvider,
    },
    previousManifest,
  );

  const groupKeys = manifest.groups.map(mergeKey).sort();
  const enrichedState: ExplorationState = {
    ...stateBase,
    manifestGroupKeys: groupKeys,
  };

  const enrichedManifest: CrawlerManifest = {
    ...manifest,
    routeTemplate: stateBase.routeTemplate,
    exploration: {
      ...(manifest.exploration ?? {}),
      stateIds: Array.from(
        new Set([...(manifest.exploration?.stateIds ?? []), enrichedState.id]),
      ),
      actionCount: graph.actions.length,
      strategy,
    },
    groups: manifest.groups.map((group) =>
      group.stateId ? group : { ...group, stateId: enrichedState.id },
    ),
  };

  manifests.set(stateBase.routeTemplate, enrichedManifest);

  if (!existingId) {
    stateIdsByKey.set(key, enrichedState.id);
    graph.states.push(enrichedState);
  } else {
    const idx = graph.states.findIndex((s) => s.id === enrichedState.id);
    if (idx !== -1) graph.states[idx] = enrichedState;
  }

  const candidates = await extractActionCandidates(page, {
    scope: options.scope,
    strategy,
  }).catch(() => []);

  return { state: enrichedState, manifest: enrichedManifest, candidates };
}

function buildObservation(
  iteration: number,
  scan: CurrentScan,
  history: AgentHistoryEntry[],
  historyLimit: number,
  actionsRemaining: number,
  maxActions: number,
): AgentObservation {
  const visibleActions: AgentCandidate[] = scan.candidates.map((candidate, index) => ({
    index,
    kind: candidate.kind,
    label: candidate.label,
    role: candidate.locator.role,
    risk: candidate.risk,
    signature: candidate.signature,
  }));

  const recentHistory = history.slice(-historyLimit);

  return {
    iteration,
    url: scan.state.url,
    routeTemplate: scan.state.routeTemplate,
    title: scan.state.title,
    manifestGroupKeys: scan.state.manifestGroupKeys,
    visibleActions,
    recentHistory,
    budget: { actionsRemaining, maxActions },
  };
}

function decisionToCandidate(
  decision: AgentDecision,
  visible: ExplorationActionCandidate[],
  credentials: Record<string, string> | undefined,
): { candidate: ExplorationActionCandidate } | { error: string } | null {
  switch (decision.kind) {
    case "click_candidate": {
      if (decision.index < 0 || decision.index >= visible.length) return null;
      return { candidate: visible[decision.index] };
    }
    case "click_locator": {
      const signature = signatureForLocator(decision.locator, decision.label);
      return {
        candidate: {
          kind: "click",
          label: decision.label,
          locator: decision.locator,
          reason: decision.rationale ?? "agent click_locator",
          risk: "unknown",
          signature,
        },
      };
    }
    case "fill_field": {
      const resolution = resolveCredentials(decision.value, credentials);
      if ("error" in resolution) return { error: resolution.error };
      const signature = signatureForLocator(decision.locator, decision.label) + "::fill";
      return {
        candidate: {
          kind: "fill",
          label: decision.label,
          locator: decision.locator,
          reason: decision.rationale ?? "agent fill_field",
          risk: "mutation",
          signature,
          value: resolution.value,
        },
      };
    }
    case "navigate": {
      return {
        candidate: {
          kind: "navigate",
          label: decision.url,
          locator: { href: decision.url },
          reason: decision.rationale ?? "agent navigate",
          risk: "navigation",
          signature: `navigate::${decision.url}`,
        },
      };
    }
    case "stop":
      return null;
  }
}

const PLACEHOLDER_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/** Substitute `{{KEY}}` placeholders in a fill_field value. */
function resolveCredentials(
  value: string,
  credentials: Record<string, string> | undefined,
): { value: string } | { error: string } {
  let missing: string | null = null;
  const resolved = value.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    if (credentials && key in credentials) return credentials[key];
    missing = key;
    return "";
  });
  if (missing) {
    return { error: `unresolved credential placeholder {{${missing}}}` };
  }
  return { value: resolved };
}

function persistAction(
  graph: ExplorationGraph,
  candidate: ExplorationActionCandidate,
  stateId: string,
  actionNumber: number,
  decision: AgentDecision,
): ExplorationAction {
  const action: ExplorationAction = {
    ...candidate,
    id: `a${actionNumber}`,
    stateId,
    status: "attempted",
    timestamp: new Date().toISOString(),
    reason: decisionRationale(decision) ?? candidate.reason,
  };
  graph.actions.push(action);
  return action;
}

function decisionRationale(decision: AgentDecision): string | undefined {
  if (decision.kind === "click_candidate") return decision.rationale;
  if (decision.kind === "click_locator") return decision.rationale;
  if (decision.kind === "fill_field") return decision.rationale;
  if (decision.kind === "navigate") return decision.rationale;
  return undefined;
}

function summarizeDecision(decision: AgentDecision): AgentHistoryEntry["decision"] {
  switch (decision.kind) {
    case "click_candidate":
      return { kind: "click_candidate", index: decision.index };
    case "click_locator":
      return { kind: "click_locator", label: decision.label };
    case "fill_field":
      return { kind: "fill_field", label: decision.label };
    case "navigate":
      return { kind: "navigate", url: decision.url };
    case "stop":
      return { kind: "stop", reason: decision.reason };
  }
}

function signatureForLocator(locator: { role?: string; name?: string; selector?: string; testId?: string; text?: string }, label: string): string {
  const role = locator.role ?? "";
  const target = locator.testId ?? locator.selector ?? locator.text ?? label;
  return ["click", role, label.toLowerCase(), target].join("::");
}

function attachApiDependencies(
  manifests: Map<string, CrawlerManifest>,
  routeTemplate: string,
  deps: ApiDependency[],
): void {
  if (deps.length === 0) return;
  const manifest = manifests.get(routeTemplate);
  if (!manifest) return;

  const seen = new Map<string, ApiDependency>();
  for (const dep of [...(manifest.apiDependencies ?? []), ...deps]) {
    const key = `${dep.method}:${dep.pattern}`;
    if (!seen.has(key)) seen.set(key, dep);
  }
  manifest.apiDependencies = Array.from(seen.values());
}

function stateKey(state: ExplorationState): string {
  return [state.routeTemplate, state.domHash, state.ariaHash, state.actionHash].join("::");
}

function formatDecisionLog(iteration: number, decision: AgentDecision): string {
  switch (decision.kind) {
    case "click_candidate":
      return `agent[#${iteration}] click_candidate(${decision.index})`;
    case "click_locator":
      return `agent[#${iteration}] click_locator("${decision.label}")`;
    case "fill_field":
      return `agent[#${iteration}] fill_field("${decision.label}")`;
    case "navigate":
      return `agent[#${iteration}] navigate(${decision.url})`;
    case "stop":
      return `agent[#${iteration}] stop: ${decision.reason}`;
  }
}

function noop(_line: string): void {}
