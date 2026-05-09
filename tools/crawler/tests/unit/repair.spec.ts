/**
 * Tests for the assisted-repair pass.
 *
 * Pure tests cover the Anthropic repair-agent shape (buildAnthropicRepairRequest,
 * extractRepairDecision, formatRepairContextMessage). The integration test
 * uses a real Playwright page + a scripted IRepairAgent stub to verify
 * suggestRepairs walks the failed path, calls the agent, and produces a
 * RepairReport.
 */

import { test, expect } from "@playwright/test";
import {
  buildAnthropicRepairRequest,
  extractRepairDecision,
  formatRepairContextMessage,
} from "../../src/ai/agent-anthropic.js";
import { suggestRepairs } from "../../src/repair.js";
import { PlaywrightBrowserController } from "../../src/browser-controller.js";
import type {
  IRepairAgent,
  RepairContext,
  RepairDecision,
} from "../../src/repair-types.js";
import type {
  ExplorationAction,
  ExplorationGraph,
} from "../../src/explore-types.js";
import type { DriftReport } from "../../src/replay.js";

const BASE = "http://localhost:9999";
const PAGE_BODY = `<!doctype html>
<html><body>
  <h1>Repair demo</h1>
  <button id="primary">Continue</button>
  <button id="secondary">Cancel</button>
</body></html>`;

// ── Pure tests ──────────────────────────────────────────────

function makeAction(overrides: Partial<ExplorationAction> = {}): ExplorationAction {
  return {
    id: "a1",
    stateId: "s1",
    kind: "click",
    label: "Add Product",
    locator: { role: "button", name: "Add Product", selector: "#add" },
    reason: "test",
    risk: "safe",
    signature: "click::button::add product",
    status: "failed",
    timestamp: "2026-05-09T00:00:00.000Z",
    error: "selector did not match",
    ...overrides,
  };
}

function makeContext(overrides: Partial<RepairContext> = {}): RepairContext {
  return {
    failedAction: makeAction(),
    failureReason: "selector did not match",
    pageUrl: "http://localhost/products",
    pageTitle: "Products",
    visibleCandidates: [
      {
        index: 0,
        kind: "click",
        label: "New Product",
        role: "button",
        risk: "safe",
        signature: "click::button::new product",
      },
    ],
    history: [{ actionId: "a0", kind: "navigate", label: "Products" }],
    ...overrides,
  };
}

test.describe("Repair — buildAnthropicRepairRequest", () => {
  test("emits cache_control on the system block by default", () => {
    const body = buildAnthropicRepairRequest(makeContext(), {
      model: "claude-sonnet-4-20250514",
      maxTokens: 256,
      systemPrompt: "repair sys",
      toolChoice: { type: "auto" },
      enablePromptCache: true,
    });

    expect(body.system).toEqual([
      { type: "text", text: "repair sys", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.messages).toHaveLength(1);
  });

  test("omits cache_control when caching is disabled", () => {
    const body = buildAnthropicRepairRequest(makeContext(), {
      model: "claude-sonnet-4-20250514",
      maxTokens: 256,
      systemPrompt: "repair sys",
      toolChoice: { type: "auto" },
      enablePromptCache: false,
    });

    expect(body.system).toEqual([{ type: "text", text: "repair sys" }]);
  });
});

test.describe("Repair — extractRepairDecision", () => {
  test("translates replace_with_candidate", () => {
    const decision = extractRepairDecision({
      content: [
        {
          type: "tool_use",
          name: "replace_with_candidate",
          input: { index: 0, label: "New Product", rationale: "renamed" },
        },
      ],
    });
    expect(decision).toEqual({
      kind: "replace_with_candidate",
      index: 0,
      label: "New Product",
      rationale: "renamed",
    });
  });

  test("translates replace_with_locator with sanitized hint", () => {
    const decision = extractRepairDecision({
      content: [
        {
          type: "tool_use",
          name: "replace_with_locator",
          input: {
            locator: { role: "button", name: "Save", malformed: 1 },
            label: "Save",
            rationale: "moved into a dialog",
          },
        },
      ],
    });
    expect(decision).toEqual({
      kind: "replace_with_locator",
      locator: { role: "button", name: "Save" },
      label: "Save",
      rationale: "moved into a dialog",
    });
  });

  test("translates give_up with default reason when omitted", () => {
    const decision = extractRepairDecision({
      content: [{ type: "tool_use", name: "give_up", input: {} }],
    });
    expect(decision).toEqual({
      kind: "give_up",
      reason: "agent gave up without explicit reason",
    });
  });

  test("returns null when no tool_use present", () => {
    expect(extractRepairDecision({ content: [{ type: "text", text: "thinking" }] })).toBeNull();
  });
});

test.describe("Repair — formatRepairContextMessage", () => {
  test("includes failed action, page state, and visible candidates", () => {
    const text = formatRepairContextMessage(makeContext());
    expect(text).toContain("Failed action: a1");
    expect(text).toContain('label: "Add Product"');
    expect(text).toContain("Current page: http://localhost/products");
    expect(text).toContain("Title: Products");
    expect(text).toContain("[0] button \"New Product\"");
    expect(text).toContain("Path leading to failure (1 successful step(s)):");
    expect(text).toContain("- a0 navigate \"Products\"");
  });

  test("falls back when no candidates are visible", () => {
    const text = formatRepairContextMessage(makeContext({ visibleCandidates: [] }));
    expect(text).toContain("No visible action candidates");
  });
});

// ── Integration test (real browser + scripted agent) ────────

test.describe("Repair — suggestRepairs", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: PAGE_BODY });
    });
  });

  test("re-replays to the failure point and asks the agent for a fix", async ({ page }) => {
    const action = makeAction({
      id: "a1",
      stateId: "s1",
      label: "Old Label",
      locator: { role: "button", name: "Definitely Missing", selector: "#nope" },
      status: "failed",
    });

    const graph: ExplorationGraph = {
      schemaVersion: 1,
      startUrl: `${BASE}/`,
      strategy: "balanced",
      startedAt: "2026-05-09T00:00:00.000Z",
      states: [
        {
          id: "s1",
          url: `${BASE}/`,
          routeTemplate: "/",
          pathname: "/",
          title: "Repair demo",
          domHash: "h1",
          ariaHash: "h2",
          actionHash: "h3",
          visibleActionCount: 2,
          manifestGroupKeys: [],
          discoveredAt: "2026-05-09T00:00:00.000Z",
        },
      ],
      actions: [action],
      transitions: [],
      summary: {
        attemptedActions: 1,
        succeededActions: 0,
        failedActions: 1,
        skippedActions: 0,
        routeCount: 1,
      },
    };

    const driftReport: DriftReport = {
      startUrl: `${BASE}/`,
      strategy: "balanced",
      paths: [
        {
          targetStateId: "s1",
          routeTemplate: "/",
          actionIds: ["a1"],
          status: "failed",
          failure: {
            actionId: "a1",
            actionLabel: action.label,
            actionKind: action.kind,
            reason: "selector did not match",
          },
        },
      ],
      manifests: [],
      unchanged: false,
      summary: {
        pathsAttempted: 1,
        pathsCompleted: 0,
        pathsFailed: 1,
        actionsReplayed: 0,
        actionsFailed: 1,
        routesCompared: 0,
        routesWithGroupDrift: 0,
        routesWithApiDrift: 0,
        routesMissingBaseline: 0,
      },
    };

    const seenContexts: RepairContext[] = [];
    const stubAgent: IRepairAgent = {
      name: "stub-repair",
      async suggest(context: RepairContext): Promise<RepairDecision> {
        seenContexts.push(context);
        return {
          kind: "replace_with_candidate",
          index: 0,
          rationale: "stub picks first candidate",
        };
      },
    };

    const controller = new PlaywrightBrowserController(page);
    const repairReport = await suggestRepairs(controller, graph, driftReport, stubAgent, {
      graphFile: "test-graph.json",
    });

    expect(seenContexts).toHaveLength(1);
    expect(seenContexts[0].failedAction.id).toBe("a1");
    expect(seenContexts[0].pageUrl).toContain(BASE);
    expect(seenContexts[0].visibleCandidates.length).toBeGreaterThan(0);

    expect(repairReport.suggestions).toHaveLength(1);
    expect(repairReport.suggestions[0].decisionKind).toBe("replace_with_candidate");
    expect(repairReport.suggestions[0].suggested).not.toBeNull();
    expect(repairReport.summary).toEqual({
      failuresConsidered: 1,
      repaired: 1,
      gaveUp: 0,
      unreachable: 0,
    });
    expect(repairReport.graphFile).toBe("test-graph.json");
    expect(repairReport.agent).toBe("stub-repair");
  });

  test("records give_up suggestions without marking them as repaired", async ({ page }) => {
    const action = makeAction({ id: "a1", stateId: "s1" });
    const graph: ExplorationGraph = {
      schemaVersion: 1,
      startUrl: `${BASE}/`,
      strategy: "balanced",
      startedAt: "2026-05-09T00:00:00.000Z",
      states: [
        {
          id: "s1",
          url: `${BASE}/`,
          routeTemplate: "/",
          pathname: "/",
          title: "Repair demo",
          domHash: "h1",
          ariaHash: "h2",
          actionHash: "h3",
          visibleActionCount: 2,
          manifestGroupKeys: [],
          discoveredAt: "2026-05-09T00:00:00.000Z",
        },
      ],
      actions: [action],
      transitions: [],
      summary: {
        attemptedActions: 1,
        succeededActions: 0,
        failedActions: 1,
        skippedActions: 0,
        routeCount: 1,
      },
    };
    const driftReport: DriftReport = {
      startUrl: `${BASE}/`,
      strategy: "balanced",
      paths: [
        {
          targetStateId: "s1",
          routeTemplate: "/",
          actionIds: ["a1"],
          status: "failed",
          failure: {
            actionId: "a1",
            actionLabel: action.label,
            actionKind: "click",
            reason: "selector did not match",
          },
        },
      ],
      manifests: [],
      unchanged: false,
      summary: {
        pathsAttempted: 1,
        pathsCompleted: 0,
        pathsFailed: 1,
        actionsReplayed: 0,
        actionsFailed: 1,
        routesCompared: 0,
        routesWithGroupDrift: 0,
        routesWithApiDrift: 0,
        routesMissingBaseline: 0,
      },
    };

    const stubAgent: IRepairAgent = {
      name: "stub-give-up",
      async suggest(): Promise<RepairDecision> {
        return { kind: "give_up", reason: "nothing fits" };
      },
    };

    const controller = new PlaywrightBrowserController(page);
    const repairReport = await suggestRepairs(controller, graph, driftReport, stubAgent);

    expect(repairReport.suggestions).toHaveLength(1);
    expect(repairReport.suggestions[0].decisionKind).toBe("give_up");
    expect(repairReport.suggestions[0].suggested).toBeNull();
    expect(repairReport.summary.repaired).toBe(0);
    expect(repairReport.summary.gaveUp).toBe(1);
  });
});
