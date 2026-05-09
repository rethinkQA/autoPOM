/**
 * Unit tests for the deterministic replay drift engine.
 *
 * Covers:
 *   - exploration graph schema validation
 *   - replay path planning (BFS, dedup, deterministic ordering)
 *   - action locator strategy selection
 *   - drift report formatting
 */

import { test, expect } from "@playwright/test";
import {
  GraphValidationError,
  formatDriftReport,
  hasResolvableLocator,
  planReplayPaths,
  validateExplorationGraph,
} from "../../src/replay.js";
import type { DriftReport } from "../../src/replay.js";
import { selectLocatorStrategy } from "../../src/browser-controller.js";
import type {
  ExplorationAction,
  ExplorationActionStatus,
  ExplorationGraph,
  ExplorationState,
  ExplorationTransition,
} from "../../src/explore-types.js";

// ── Fixture builders ────────────────────────────────────────

function makeState(id: string, routeTemplate: string, overrides: Partial<ExplorationState> = {}): ExplorationState {
  return {
    id,
    url: `http://localhost:3001${routeTemplate}`,
    routeTemplate,
    pathname: routeTemplate,
    title: id,
    domHash: `dom-${id}`,
    ariaHash: `aria-${id}`,
    actionHash: `action-${id}`,
    visibleActionCount: 0,
    manifestGroupKeys: [],
    discoveredAt: "2026-05-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeAction(
  id: string,
  stateId: string,
  status: ExplorationActionStatus = "succeeded",
  overrides: Partial<ExplorationAction> = {},
): ExplorationAction {
  return {
    id,
    stateId,
    kind: "click",
    label: `action ${id}`,
    locator: { role: "button", name: `action ${id}`, selector: `#${id}` },
    reason: "test action",
    risk: "safe",
    signature: `click::button::${id}`,
    status,
    timestamp: "2026-05-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeTransition(
  fromStateId: string,
  actionId: string,
  toStateId?: string,
  overrides: Partial<ExplorationTransition> = {},
): ExplorationTransition {
  return {
    fromStateId,
    actionId,
    ...(toStateId ? { toStateId } : {}),
    navigation: false,
    newGroups: [],
    newApiDependencies: [],
    errors: [],
    ...overrides,
  };
}

function makeGraph(
  states: ExplorationState[],
  actions: ExplorationAction[],
  transitions: ExplorationTransition[],
  overrides: Partial<ExplorationGraph> = {},
): ExplorationGraph {
  return {
    schemaVersion: 1,
    startUrl: "http://localhost:3001/",
    strategy: "conservative",
    startedAt: "2026-05-09T00:00:00.000Z",
    finishedAt: "2026-05-09T00:00:00.000Z",
    states,
    actions,
    transitions,
    summary: {
      attemptedActions: actions.length,
      succeededActions: actions.filter((a) => a.status === "succeeded").length,
      failedActions: actions.filter((a) => a.status === "failed").length,
      skippedActions: actions.filter((a) => a.status === "skipped").length,
      routeCount: new Set(states.map((s) => s.routeTemplate)).size,
    },
    ...overrides,
  };
}

// ── validateExplorationGraph ────────────────────────────────

test.describe("Replay — graph validation", () => {
  test("accepts a well-formed graph", () => {
    const graph = makeGraph(
      [makeState("s1", "/")],
      [],
      [],
    );
    const validated = validateExplorationGraph(JSON.parse(JSON.stringify(graph)));
    expect(validated.startUrl).toBe(graph.startUrl);
  });

  test("rejects unsupported schemaVersion", () => {
    const graph = makeGraph([makeState("s1", "/")], [], []);
    const cloned = { ...JSON.parse(JSON.stringify(graph)), schemaVersion: 99 };
    expect(() => validateExplorationGraph(cloned)).toThrow(GraphValidationError);
  });

  test("rejects unknown strategies", () => {
    const graph = makeGraph([makeState("s1", "/")], [], []);
    const cloned = { ...JSON.parse(JSON.stringify(graph)), strategy: "yolo" };
    expect(() => validateExplorationGraph(cloned)).toThrow(/strategy must be one of/);
  });

  test("rejects actions referencing unknown states", () => {
    const graph = makeGraph(
      [makeState("s1", "/")],
      [makeAction("a1", "ghost-state")],
      [],
    );
    expect(() => validateExplorationGraph(JSON.parse(JSON.stringify(graph))))
      .toThrow(/references unknown state/);
  });

  test("rejects transitions referencing unknown actions", () => {
    const states = [makeState("s1", "/"), makeState("s2", "/about")];
    const actions = [makeAction("a1", "s1")];
    const transitions = [makeTransition("s1", "ghost-action", "s2")];
    const graph = makeGraph(states, actions, transitions);
    expect(() => validateExplorationGraph(JSON.parse(JSON.stringify(graph))))
      .toThrow(/references unknown action/);
  });

  test("rejects duplicate state ids", () => {
    const graph = makeGraph(
      [makeState("s1", "/"), makeState("s1", "/about")],
      [],
      [],
    );
    expect(() => validateExplorationGraph(JSON.parse(JSON.stringify(graph))))
      .toThrow(/duplicate state id/);
  });
});

// ── planReplayPaths ─────────────────────────────────────────

test.describe("Replay — path planning", () => {
  test("returns no paths for an empty graph", () => {
    const graph = makeGraph([], [], []);
    expect(planReplayPaths(graph)).toEqual([]);
  });

  test("returns no paths when no actions succeeded", () => {
    const states = [makeState("s1", "/"), makeState("s2", "/about")];
    const actions = [makeAction("a1", "s1", "failed")];
    const transitions = [makeTransition("s1", "a1", "s2")];
    expect(planReplayPaths(makeGraph(states, actions, transitions))).toEqual([]);
  });

  test("walks successful transitions BFS-style and produces shortest paths", () => {
    // Graph: s1 -a1-> s2 -a2-> s3
    //        s1 -a3-> s3 (longer route also exists via a4 from s2)
    const states = [
      makeState("s1", "/"),
      makeState("s2", "/products"),
      makeState("s3", "/products/featured"),
    ];
    const actions = [
      makeAction("a1", "s1"),
      makeAction("a2", "s2"),
      makeAction("a3", "s1"),
      makeAction("a4", "s2"),
    ];
    const transitions = [
      makeTransition("s1", "a1", "s2"),
      makeTransition("s2", "a2", "s3"),
      makeTransition("s1", "a3", "s3"),
      makeTransition("s2", "a4", "s3"),
    ];
    const paths = planReplayPaths(makeGraph(states, actions, transitions));

    expect(paths).toHaveLength(2);
    const byTarget = new Map(paths.map((p) => [p.targetStateId, p]));
    expect(byTarget.get("s2")?.actions.map((a) => a.id)).toEqual(["a1"]);
    expect(byTarget.get("s3")?.actions.map((a) => a.id)).toEqual(["a3"]);
  });

  test("ignores self-loops and missing toStateId", () => {
    const states = [makeState("s1", "/"), makeState("s2", "/list")];
    const actions = [makeAction("a1", "s1"), makeAction("a2", "s1"), makeAction("a3", "s1")];
    const transitions = [
      makeTransition("s1", "a1", "s1"), // self-loop
      makeTransition("s1", "a2", undefined), // missing toStateId
      makeTransition("s1", "a3", "s2"),
    ];
    const paths = planReplayPaths(makeGraph(states, actions, transitions));
    expect(paths.map((p) => p.targetStateId)).toEqual(["s2"]);
    expect(paths[0].actions.map((a) => a.id)).toEqual(["a3"]);
  });

  test("sorts results deterministically by route, length, then state id", () => {
    const states = [
      makeState("s1", "/"),
      makeState("s2", "/zeta"),
      makeState("s3", "/alpha"),
      makeState("s4", "/alpha/details"),
    ];
    const actions = [
      makeAction("a1", "s1"),
      makeAction("a2", "s1"),
      makeAction("a3", "s3"),
    ];
    const transitions = [
      makeTransition("s1", "a1", "s2"),
      makeTransition("s1", "a2", "s3"),
      makeTransition("s3", "a3", "s4"),
    ];
    const paths = planReplayPaths(makeGraph(states, actions, transitions));
    expect(paths.map((p) => p.routeTemplate)).toEqual([
      "/alpha",
      "/alpha/details",
      "/zeta",
    ]);
  });

  test("respects maxPaths", () => {
    const states = [
      makeState("s1", "/"),
      makeState("s2", "/a"),
      makeState("s3", "/b"),
    ];
    const actions = [makeAction("a1", "s1"), makeAction("a2", "s1")];
    const transitions = [
      makeTransition("s1", "a1", "s2"),
      makeTransition("s1", "a2", "s3"),
    ];
    const paths = planReplayPaths(makeGraph(states, actions, transitions), { maxPaths: 1 });
    expect(paths).toHaveLength(1);
    expect(paths[0].targetStateId).toBe("s2");
  });
});

// ── selectLocatorStrategy ───────────────────────────────────

test.describe("Replay — action locator resolution", () => {
  test("prefers role + accessible name", () => {
    const result = selectLocatorStrategy({
      role: "button",
      name: "Add Product",
      label: "Add Product",
      testId: "add-product",
      text: "Add Product",
      selector: "button.primary",
    });
    expect(result.strategy).toBe("role");
    expect(result.detail).toBe("button:Add Product");
  });

  test("falls through to label, testId, text, then selector", () => {
    expect(selectLocatorStrategy({ label: "Email" }).strategy).toBe("label");
    expect(selectLocatorStrategy({ testId: "submit" }).strategy).toBe("testId");
    expect(selectLocatorStrategy({ text: "Save" }).strategy).toBe("text");
    expect(selectLocatorStrategy({ selector: ".btn" }).strategy).toBe("selector");
  });

  test("returns 'none' when nothing is resolvable", () => {
    expect(selectLocatorStrategy({}).strategy).toBe("none");
  });

  test("hasResolvableLocator agrees with selectLocatorStrategy", () => {
    expect(hasResolvableLocator({ role: "button", name: "x" })).toBe(true);
    expect(hasResolvableLocator({ selector: "#thing" })).toBe(true);
    expect(hasResolvableLocator({ role: "button" })).toBe(false); // role without name
    expect(hasResolvableLocator({})).toBe(false);
  });
});

// ── formatDriftReport ───────────────────────────────────────

test.describe("Replay — drift report formatting", () => {
  test("formats an unchanged report as a passing summary", () => {
    const report: DriftReport = {
      startUrl: "http://localhost:3001/",
      strategy: "conservative",
      paths: [],
      manifests: [],
      unchanged: true,
      summary: {
        pathsAttempted: 0,
        pathsCompleted: 0,
        pathsFailed: 0,
        actionsReplayed: 0,
        actionsFailed: 0,
        routesCompared: 0,
        routesWithGroupDrift: 0,
        routesWithApiDrift: 0,
        routesMissingBaseline: 0,
      },
    };

    const text = formatDriftReport(report);
    expect(text).toContain("✓ Replay drift check passed");
    expect(text).not.toContain("Failed paths");
    expect(text).not.toContain("Drift in");
  });

  test("renders failed paths and manifest drift deterministically", () => {
    const report: DriftReport = {
      startUrl: "http://localhost:3001/",
      strategy: "conservative",
      paths: [
        {
          targetStateId: "s2",
          routeTemplate: "/products",
          actionIds: ["a1"],
          status: "failed",
          failure: {
            actionId: "a1",
            actionLabel: "Add Product",
            actionKind: "click",
            reason: "selector did not match",
          },
        },
      ],
      manifests: [
        {
          routeTemplate: "/products",
          baseline: "present",
          diff: {
            added: [],
            removed: [
              {
                label: "Product Form",
                selector: "form#product",
                groupType: "form",
                wrapperType: "group",
                discoveredIn: "pass-1",
                visibility: "static",
                lastSeen: "2026-05-09T00:00:00.000Z",
              },
            ],
            changed: [],
            unchanged: false,
          },
          apiDependenciesAdded: [],
          apiDependenciesRemoved: [
            { method: "POST", pattern: "/api/products", timing: "interaction" },
          ],
        },
        {
          routeTemplate: "/checkout",
          baseline: "missing",
          apiDependenciesAdded: [],
          apiDependenciesRemoved: [],
        },
      ],
      unchanged: false,
      summary: {
        pathsAttempted: 1,
        pathsCompleted: 0,
        pathsFailed: 1,
        actionsReplayed: 0,
        actionsFailed: 1,
        routesCompared: 2,
        routesWithGroupDrift: 1,
        routesWithApiDrift: 1,
        routesMissingBaseline: 1,
      },
    };

    const text = formatDriftReport(report);
    expect(text.startsWith("⚠ Replay drift detected.")).toBe(true);
    expect(text).toContain("Failed paths (1):");
    expect(text).toContain("✗ s2 (/products)");
    expect(text).toContain("action: click \"Add Product\" (a1)");
    expect(text).toContain("reason: selector did not match");
    expect(text).toContain("Drift in /products:");
    expect(text).toContain("- [group] \"Product Form\" (form#product)");
    expect(text).toContain("API removed (1):");
    expect(text).toContain("- POST /api/products");
    expect(text).toContain("Missing baseline for /checkout.");
  });
});
