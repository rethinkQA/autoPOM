/**
 * Assisted-repair pass.
 *
 * After a `pw-crawl drift` run produces a `DriftReport`, this module re-walks
 * each failed path up to the failure point, gathers the current visible
 * candidates, and asks an `IRepairAgent` for a suggested replacement. The
 * output is a `RepairReport` written to disk for human review — the original
 * graph and manifests are never mutated.
 */

import type { IBrowserController } from "./browser-controller.js";
import { extractActionCandidates } from "./explore-planner.js";
import type { DriftReport, ReplayPathResult } from "./replay.js";
import type {
  ExplorationAction,
  ExplorationGraph,
} from "./explore-types.js";
import type { AgentCandidate } from "./agent-types.js";
import type {
  IRepairAgent,
  RepairContext,
  RepairDecision,
  RepairHistoryEntry,
  RepairReport,
  RepairSuggestion,
  SuggestRepairsOptions,
} from "./repair-types.js";

/**
 * Walk every failed path in `report`, collect visible candidates at the
 * failure point, and ask `agent` for a replacement. Returns a deterministic
 * `RepairReport` keyed by action id.
 */
export async function suggestRepairs(
  controller: IBrowserController,
  graph: ExplorationGraph,
  report: DriftReport,
  agent: IRepairAgent,
  options: SuggestRepairsOptions = {},
): Promise<RepairReport> {
  const log = options.log ?? noop;
  const actionsById = new Map<string, ExplorationAction>();
  for (const action of graph.actions) actionsById.set(action.id, action);

  const failedPaths = report.paths.filter(
    (path): path is ReplayPathResult & { failure: NonNullable<ReplayPathResult["failure"]> } =>
      path.status === "failed" && Boolean(path.failure),
  );

  const suggestions: RepairSuggestion[] = [];
  let repaired = 0;
  let gaveUp = 0;
  let unreachable = 0;

  for (const path of failedPaths) {
    const failure = path.failure;
    const failedAction = actionsById.get(failure.actionId);
    if (!failedAction) {
      log(`repair: skipping ${failure.actionId} — not in graph`);
      continue;
    }

    const failureIndex = path.actionIds.indexOf(failure.actionId);
    if (failureIndex === -1) {
      log(`repair: skipping ${failure.actionId} — not on its path`);
      continue;
    }

    const reachable = await replayUpTo(controller, report.startUrl, path.actionIds.slice(0, failureIndex), actionsById);
    if (!reachable) {
      log(`repair: unreachable failure for ${failure.actionId} (path replay aborted before failure point)`);
      unreachable++;
      suggestions.push(buildUnreachableSuggestion(path, failedAction, failure.reason));
      continue;
    }

    const candidates = await extractActionCandidates(controller.page(), {
      scope: options.scope,
      strategy: "balanced",
    }).catch(() => []);

    const visibleCandidates: AgentCandidate[] = candidates.map((candidate, index) => ({
      index,
      kind: candidate.kind,
      label: candidate.label,
      role: candidate.locator.role,
      risk: candidate.risk,
      signature: candidate.signature,
    }));

    const history: RepairHistoryEntry[] = path.actionIds
      .slice(0, failureIndex)
      .map((id) => {
        const action = actionsById.get(id);
        return action
          ? { actionId: action.id, kind: action.kind, label: action.label }
          : { actionId: id, kind: "click" as const, label: "(missing from graph)" };
      });

    const context: RepairContext = {
      failedAction,
      failureReason: failure.reason,
      pageUrl: controller.currentUrl(),
      pageTitle: await safeTitle(controller),
      visibleCandidates,
      history,
    };

    log(`repair: asking agent for ${failure.actionId} ("${failedAction.label}")`);
    const decision = await agent.suggest(context);
    const suggestion = buildSuggestion(path, failedAction, failure.reason, decision, candidates);
    suggestions.push(suggestion);

    if (suggestion.decisionKind === "give_up") gaveUp++;
    else if (suggestion.suggested) repaired++;
  }

  suggestions.sort((a, b) => a.actionId.localeCompare(b.actionId));

  return {
    schemaVersion: 1,
    graphFile: options.graphFile,
    generatedAt: new Date().toISOString(),
    agent: agent.name,
    suggestions,
    summary: {
      failuresConsidered: failedPaths.length,
      repaired,
      gaveUp,
      unreachable,
    },
  };
}

// ── Internals ───────────────────────────────────────────────

async function replayUpTo(
  controller: IBrowserController,
  startUrl: string,
  actionIds: string[],
  actionsById: Map<string, ExplorationAction>,
): Promise<boolean> {
  await controller.goto(startUrl);
  for (const id of actionIds) {
    const action = actionsById.get(id);
    if (!action) return false;
    try {
      await controller.perform(action);
      await controller.waitForSettled();
    } catch {
      return false;
    }
  }
  return true;
}

async function safeTitle(controller: IBrowserController): Promise<string> {
  try {
    return await controller.page().title();
  } catch {
    return "";
  }
}

function buildSuggestion(
  path: ReplayPathResult,
  failedAction: ExplorationAction,
  failureReason: string,
  decision: RepairDecision,
  candidates: import("./explore-types.js").ExplorationActionCandidate[],
): RepairSuggestion {
  const base: Pick<RepairSuggestion, "actionId" | "pathTargetStateId" | "failureReason" | "current"> = {
    actionId: failedAction.id,
    pathTargetStateId: path.targetStateId,
    failureReason,
    current: {
      locator: failedAction.locator,
      label: failedAction.label,
      kind: failedAction.kind,
    },
  };

  switch (decision.kind) {
    case "replace_with_candidate": {
      const candidate = decision.index >= 0 && decision.index < candidates.length
        ? candidates[decision.index]
        : undefined;
      if (!candidate) {
        return {
          ...base,
          suggested: null,
          rationale: `agent picked candidate index ${decision.index}, but no such candidate was visible`,
          decisionKind: "give_up",
        };
      }
      return {
        ...base,
        suggested: { locator: candidate.locator, label: decision.label ?? candidate.label },
        rationale: decision.rationale,
        decisionKind: "replace_with_candidate",
      };
    }
    case "replace_with_locator": {
      return {
        ...base,
        suggested: { locator: decision.locator, label: decision.label },
        rationale: decision.rationale,
        decisionKind: "replace_with_locator",
      };
    }
    case "give_up": {
      return {
        ...base,
        suggested: null,
        rationale: decision.reason,
        decisionKind: "give_up",
      };
    }
  }
}

function buildUnreachableSuggestion(
  path: ReplayPathResult,
  failedAction: ExplorationAction,
  failureReason: string,
): RepairSuggestion {
  return {
    actionId: failedAction.id,
    pathTargetStateId: path.targetStateId,
    failureReason,
    current: {
      locator: failedAction.locator,
      label: failedAction.label,
      kind: failedAction.kind,
    },
    suggested: null,
    rationale: "could not re-replay path to failure point — earlier action also broke",
    decisionKind: "give_up",
  };
}

function noop(_line: string): void {}
