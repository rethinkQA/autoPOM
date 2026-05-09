/**
 * Autonomous exploration orchestration.
 *
 * This mode uses a heuristic planner plus the existing crawler discovery and
 * emitter pipeline. It intentionally records discoveries into manifests rather
 * than letting an agent write page objects directly.
 */

import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { PlaywrightBrowserController, type IBrowserController } from "./browser-controller.js";
import { crawlPage } from "./crawler.js";
import { extractActionCandidates } from "./explore-planner.js";
import type {
  ExplorationAction,
  ExplorationActionCandidate,
  ExplorationGraph,
  ExplorationState,
  ExplorationTransition,
  ExploreOptions,
  ExploreResult,
  ExploreStrategy,
} from "./explore-types.js";
import { mergeKey } from "./merge.js";
import { normalizeRoute } from "./naming.js";
import { NetworkObserver } from "./network.js";
import type { ApiDependency, CrawlerManifest } from "./types.js";

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_ACTIONS = 20;
const DEFAULT_MAX_ROUTES = 10;
const DEFAULT_MAX_RESCANS = 2;

/** Explore a page with the default direct Playwright controller. */
export async function explorePage(
  page: Page,
  startUrl: string,
  options: ExploreOptions = {},
): Promise<ExploreResult> {
  return exploreWithController(new PlaywrightBrowserController(page), startUrl, options);
}

/** Explore a page using an injected browser controller. */
export async function exploreWithController(
  controller: IBrowserController,
  startUrl: string,
  options: ExploreOptions = {},
): Promise<ExploreResult> {
  const strategy = options.strategy ?? "conservative";
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  const maxRoutes = options.maxRoutes ?? DEFAULT_MAX_ROUTES;
  const maxRescans = options.maxRescans ?? DEFAULT_MAX_RESCANS;

  const graph = createExplorationGraph(startUrl, strategy);
  const manifests = new Map<string, CrawlerManifest>();
  const stateIdsByKey = new Map<string, string>();
  const queuedStateKeys = new Set<string>();
  const routeScanCounts = new Map<string, number>();
  const attemptedActionKeys = new Set<string>();

  let nextActionNumber = 1;
  let nextStateNumber = 1;

  async function scanCurrentState(enteredByActionId?: string): Promise<{ state: ExplorationState; manifest: CrawlerManifest; isNewState: boolean }> {
    const page = controller.page();
    const snapshot = await snapshotExplorationState(page, enteredByActionId);
    const existingStateId = stateIdsByKey.get(stateKey(snapshot));
    const state = existingStateId
      ? { ...snapshot, id: existingStateId }
      : { ...snapshot, id: `s${nextStateNumber++}` };

    const routeScans = (routeScanCounts.get(state.routeTemplate) ?? 0) + 1;
    routeScanCounts.set(state.routeTemplate, routeScans);

    const existing = manifests.get(state.routeTemplate) ?? null;
    const manifest = await crawlPage(page, {
      scope: options.scope,
      pass: routeScans,
      observeNetwork: options.observeNetwork,
      aiProvider: options.aiProvider,
    }, existing);

    const groupKeys = manifest.groups.map(mergeKey).sort();
    const enrichedState: ExplorationState = {
      ...state,
      manifestGroupKeys: groupKeys,
    };

    const enrichedManifest: CrawlerManifest = {
      ...manifest,
      routeTemplate: state.routeTemplate,
      exploration: {
        ...(manifest.exploration ?? {}),
        stateIds: Array.from(new Set([...(manifest.exploration?.stateIds ?? []), enrichedState.id])),
        actionCount: graph.actions.length,
        strategy,
      },
      groups: manifest.groups.map((group) => group.stateId ? group : { ...group, stateId: enrichedState.id }),
    };

    manifests.set(state.routeTemplate, enrichedManifest);

    const key = stateKey(enrichedState);
    const isNewState = !stateIdsByKey.has(key);
    if (isNewState) {
      stateIdsByKey.set(key, enrichedState.id);
      graph.states.push(enrichedState);
    } else {
      const existingIndex = graph.states.findIndex((s) => s.id === enrichedState.id);
      if (existingIndex !== -1) graph.states[existingIndex] = enrichedState;
    }

    return { state: enrichedState, manifest: enrichedManifest, isNewState };
  }

  async function replayPath(path: ExplorationAction[]): Promise<boolean> {
    await controller.goto(startUrl);
    for (const action of path) {
      try {
        await controller.perform(action);
        await controller.waitForSettled();
      } catch {
        return false;
      }
    }
    return true;
  }

  const queue: ExplorationAction[][] = [[]];
  queuedStateKeys.add("root");

  while (queue.length > 0 && graph.summary.attemptedActions < maxActions) {
    const path = queue.shift()!;
    const replayed = await replayPath(path);
    if (!replayed) continue;

    const { state: fromState } = await scanCurrentState(path[path.length - 1]?.id);
    if (path.length >= maxDepth) continue;

    const candidates = await extractActionCandidates(controller.page(), {
      scope: options.scope,
      strategy,
      denyActionPatterns: options.denyActionPatterns,
      allowActionPatterns: options.allowActionPatterns,
    });

    for (const candidate of candidates) {
      if (graph.summary.attemptedActions >= maxActions) break;

      const actionKey = `${fromState.id}:${candidate.signature}`;
      if (attemptedActionKeys.has(actionKey)) continue;
      attemptedActionKeys.add(actionKey);

      const action = createActionRecord(candidate, fromState.id, nextActionNumber++);
      graph.actions.push(action);
      graph.summary.attemptedActions++;

      const beforeKeys = new Set(fromState.manifestGroupKeys);
      const fromUrl = controller.currentUrl();
      const transition = await attemptActionTransition(controller, action, async () => {
        const { state: toState, isNewState } = await scanCurrentState(action.id);
        const toKeys = new Set(toState.manifestGroupKeys);
        const newGroups = [...toKeys].filter((key) => !beforeKeys.has(key)).sort();
        return { toState, isNewState, newGroups };
      });
      transition.fromStateId = fromState.id;
      transition.navigation = normalizeRoute(fromUrl).page !== normalizeRoute(controller.currentUrl()).page || fromUrl !== controller.currentUrl();
      graph.transitions.push(transition);
      attachApiDependencies(manifests, fromState.routeTemplate, transition.newApiDependencies);

      if (action.status === "succeeded") graph.summary.succeededActions++;
      else if (action.status === "failed") graph.summary.failedActions++;
      else if (action.status === "skipped") graph.summary.skippedActions++;

      if (transition.toStateId && path.length + 1 < maxDepth) {
        const toState = graph.states.find((s) => s.id === transition.toStateId);
        if (toState && graphRouteCount(graph) <= maxRoutes) {
          const scansForRoute = routeScanCounts.get(toState.routeTemplate) ?? 0;
          const queueKey = `${toState.routeTemplate}:${toState.domHash}:${toState.ariaHash}:${toState.actionHash}`;
          if (scansForRoute <= maxRescans && !queuedStateKeys.has(queueKey)) {
            queuedStateKeys.add(queueKey);
            queue.push([...path, action]);
          }
        }
      }

      // Restore the current path state before trying the next candidate from it.
      await replayPath(path);
    }
  }

  graph.finishedAt = new Date().toISOString();
  graph.summary.routeCount = graphRouteCount(graph);

  return { graph, manifests };
}

/** Create an empty exploration graph. */
export function createExplorationGraph(startUrl: string, strategy: ExploreStrategy): ExplorationGraph {
  return {
    schemaVersion: 1,
    startUrl,
    strategy,
    startedAt: new Date().toISOString(),
    states: [],
    actions: [],
    transitions: [],
    summary: {
      attemptedActions: 0,
      succeededActions: 0,
      failedActions: 0,
      skippedActions: 0,
      routeCount: 0,
    },
  };
}

/** Capture a stable state fingerprint for the current page. */
export async function snapshotExplorationState(page: Page, enteredByActionId?: string): Promise<ExplorationState> {
  const { page: routeTemplate, pathname } = normalizeRoute(page.url());
  const [domSnapshot, ariaSnapshot, candidates, title] = await Promise.all([
    captureNormalizedDom(page),
    page.locator("body").ariaSnapshot().catch(() => ""),
    extractActionCandidates(page, { strategy: "aggressive" }).catch(() => []),
    page.title().catch(() => ""),
  ]);
  const actionSignature = candidates.map((candidate) => candidate.signature).sort().join("\n");

  return {
    id: "pending",
    url: page.url(),
    routeTemplate,
    pathname,
    title,
    domHash: hashString(domSnapshot),
    ariaHash: hashString(ariaSnapshot),
    actionHash: hashString(actionSignature),
    visibleActionCount: candidates.length,
    manifestGroupKeys: [],
    discoveredAt: new Date().toISOString(),
    ...(enteredByActionId ? { enteredByActionId } : {}),
  };
}

// ── Action execution ────────────────────────────────────────

async function attemptActionTransition(
  controller: IBrowserController,
  action: ExplorationAction,
  scanAfterAction: () => Promise<{ toState: ExplorationState; isNewState: boolean; newGroups: string[] }>,
): Promise<ExplorationTransition> {
  const observer = new NetworkObserver(controller.page());
  const interactionTimestamp = Date.now();
  let deps: ApiDependency[] = [];
  observer.start();
  observer.setAction(action.label);

  try {
    await controller.perform(action);
    await controller.waitForSettled();
    observer.clearAction();
    deps = observer.stop(interactionTimestamp);

    const result = await scanAfterAction();
    action.status = "succeeded";

    return {
      fromStateId: action.stateId,
      actionId: action.id,
      toStateId: result.toState.id,
      navigation: false,
      newGroups: result.newGroups,
      newApiDependencies: deps,
      errors: [],
    };
  } catch (err) {
    observer.clearAction();
    deps = observer.stop(interactionTimestamp);
    const message = err instanceof Error ? err.message : String(err);
    action.status = "failed";
    action.error = message;

    return {
      fromStateId: action.stateId,
      actionId: action.id,
      navigation: false,
      newGroups: [],
      newApiDependencies: deps,
      errors: [message],
    };
  }
}

function createActionRecord(candidate: ExplorationActionCandidate, stateId: string, actionNumber: number): ExplorationAction {
  return {
    ...candidate,
    id: `a${actionNumber}`,
    stateId,
    status: "attempted",
    timestamp: new Date().toISOString(),
  };
}

// ── State hashing ───────────────────────────────────────────

async function captureNormalizedDom(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;

    for (const el of Array.from(clone.querySelectorAll("script, style, noscript, template"))) {
      el.remove();
    }

    for (const el of Array.from(clone.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === "style" || name.startsWith("on") || name === "data-pw-cid") {
          el.removeAttribute(attr.name);
          continue;
        }
        if ((name === "id" || name === "for" || name === "aria-labelledby") && looksGenerated(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    }

    return clone.innerHTML.replace(/\s+/g, " ").trim();

    function looksGenerated(value: string): boolean {
      return /^(:r\d+:|_r_\d+_|_ng(content|host)-|[a-z]+-[a-f0-9]{6,}|[a-f0-9]{12,})/i.test(value);
    }
  });
}

function stateKey(state: ExplorationState): string {
  return [state.routeTemplate, state.domHash, state.ariaHash, state.actionHash].join("::");
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function graphRouteCount(graph: ExplorationGraph): number {
  return new Set(graph.states.map((state) => state.routeTemplate)).size;
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
