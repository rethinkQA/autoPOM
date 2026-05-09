/**
 * Loop test for `exploreWithAgent` using a real Playwright browser and a
 * stubbed `IExplorationAgent`. Verifies that decisions translate into graph
 * actions, transitions, and merged manifest groups.
 */

import { test, expect } from "@playwright/test";
import { exploreWithAgent } from "../../src/agent-explore.js";
import { PlaywrightBrowserController } from "../../src/browser-controller.js";
import type {
  AgentDecision,
  AgentObservation,
  IExplorationAgent,
} from "../../src/agent-types.js";

const PAGE_BODY = `<!doctype html>
<html><body>
  <h1>Agent Demo</h1>
  <nav aria-label="Main">
    <a href="#about" id="about-link">About</a>
    <a href="#contact" id="contact-link">Contact</a>
  </nav>
  <section aria-label="Hero">
    <button id="signup">Sign Up</button>
    <button id="learn">Learn more</button>
  </section>
</body></html>`;

const BASE = "http://localhost:9999";

function scriptedAgent(decisions: AgentDecision[]): {
  agent: IExplorationAgent;
  observations: AgentObservation[];
} {
  const observations: AgentObservation[] = [];
  let cursor = 0;
  const agent: IExplorationAgent = {
    name: "stub",
    async decide(observation: AgentObservation): Promise<AgentDecision> {
      observations.push(observation);
      const next = decisions[cursor++];
      if (!next) return { kind: "stop", reason: "stub script exhausted" };
      return next;
    },
  };
  return { agent, observations };
}

test.describe("exploreWithAgent — loop", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: PAGE_BODY });
    });
  });

  test("translates click_candidate decisions into graph actions and merges manifests", async ({ page }) => {
    const { agent, observations } = scriptedAgent([
      { kind: "click_candidate", index: 0, rationale: "first visible" },
      { kind: "stop", reason: "done" },
    ]);

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      { maxActions: 5, observeNetwork: false, strategy: "balanced" },
    );

    // Agent saw at least one observation with candidates we could pick from.
    expect(observations.length).toBeGreaterThanOrEqual(1);
    expect(observations[0].visibleActions.length).toBeGreaterThan(0);

    // Graph recorded the click action and a transition.
    expect(result.graph.actions).toHaveLength(1);
    expect(result.graph.actions[0].status).toBe("succeeded");
    expect(result.graph.transitions).toHaveLength(1);
    expect(result.graph.transitions[0].fromStateId).toBe(result.graph.actions[0].stateId);

    // At least one manifest entry exists for the reached route.
    expect(result.manifests.size).toBeGreaterThan(0);
  });

  test("falls back when click_candidate index is out of range", async ({ page }) => {
    const { agent } = scriptedAgent([
      { kind: "click_candidate", index: 999 },
      { kind: "stop", reason: "done" },
    ]);

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      { maxActions: 5, observeNetwork: false, strategy: "balanced" },
    );

    // No action persisted because the decision did not resolve to a candidate.
    expect(result.graph.actions).toHaveLength(0);
    expect(result.graph.summary.attemptedActions).toBe(0);
  });

  test("stop decision ends the loop immediately", async ({ page }) => {
    const { agent, observations } = scriptedAgent([
      { kind: "stop", reason: "nothing to do" },
    ]);

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      { maxActions: 50, observeNetwork: false, strategy: "balanced" },
    );

    expect(observations).toHaveLength(1);
    expect(result.graph.actions).toHaveLength(0);
    expect(result.graph.transitions).toHaveLength(0);
  });

  test("respects maxActions budget", async ({ page }) => {
    // Always click candidate 0 — agent never stops.
    const agent: IExplorationAgent = {
      name: "click-zero",
      async decide(observation: AgentObservation): Promise<AgentDecision> {
        if (observation.visibleActions.length === 0) return { kind: "stop", reason: "nothing visible" };
        return { kind: "click_candidate", index: 0 };
      },
    };

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      {
        maxActions: 3,
        maxConsecutiveNoChange: 99,
        observeNetwork: false,
        strategy: "balanced",
      },
    );

    expect(result.graph.summary.attemptedActions).toBeLessThanOrEqual(3);
  });
});
