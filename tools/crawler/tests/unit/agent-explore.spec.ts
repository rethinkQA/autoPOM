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

  test("fill_field substitutes {{KEY}} from credentials before dispatch", async ({ page }) => {
    const performed: Array<{ kind: string; value?: string; label?: string }> = [];
    const recordingController = {
      page: () => page,
      goto: async (url: string) => {
        await page.goto(url);
      },
      perform: async (action: { kind: string; value?: string; label?: string }) => {
        performed.push({ kind: action.kind, value: action.value, label: action.label });
      },
      waitForSettled: async () => {
        /* noop */
      },
      currentUrl: () => page.url(),
    };

    const { agent } = scriptedAgent([
      {
        kind: "fill_field",
        locator: { role: "textbox", name: "Email" },
        value: "{{EMAIL}}",
        label: "Email",
      },
      { kind: "stop", reason: "done" },
    ]);

    await exploreWithAgent(
      recordingController,
      agent,
      `${BASE}/`,
      {
        maxActions: 5,
        observeNetwork: false,
        strategy: "balanced",
        credentials: { EMAIL: "user@example.com" },
      },
    );

    const fill = performed.find((p) => p.kind === "fill");
    expect(fill).toBeDefined();
    expect(fill!.value).toBe("user@example.com");
    expect(fill!.label).toBe("Email");
  });

  test("fill_candidate uses the candidate's recorded locator and substitutes credentials", async ({ page }) => {
    // Page has a real <input id="email"> so extractActionCandidates surfaces a fill candidate.
    await page.route(`${BASE}/login`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
            <button type="submit">Login</button>
          </form>
        </body></html>`,
      });
    });

    let observed: AgentObservation | undefined;
    let cursor = 0;
    const agent: IExplorationAgent = {
      name: "fill-cand",
      async decide(o) {
        observed = o;
        cursor++;
        if (cursor === 1) {
          // Pick whichever candidate has kind === "fill" and ask to fill it.
          const idx = o.visibleActions.findIndex((c) => c.kind === "fill");
          if (idx === -1) return { kind: "stop", reason: "no fill candidate" };
          return { kind: "fill_candidate", index: idx, value: "{{EMAIL}}" };
        }
        return { kind: "stop", reason: "done" };
      },
    };

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/login`,
      {
        maxActions: 5,
        observeNetwork: false,
        strategy: "balanced",
        credentials: { EMAIL: "user@example.com" },
      },
    );

    expect(observed?.visibleActions.some((c) => c.kind === "fill")).toBe(true);
    expect(result.graph.actions).toHaveLength(1);
    const action = result.graph.actions[0];
    expect(action.kind).toBe("fill");
    expect(action.value).toBe("user@example.com");
    expect(action.status).toBe("succeeded");
  });

  test("fill_candidate on a non-fill candidate records a failure and does not dispatch", async ({ page }) => {
    const agent: IExplorationAgent = {
      name: "wrong-kind",
      async decide(o) {
        // visibleActions[0] from the demo HTML is a "click" candidate (Sign Up button).
        // Asking to fill_candidate it should surface a typed error.
        if (o.visibleActions.length === 0) return { kind: "stop", reason: "nothing visible" };
        return { kind: "fill_candidate", index: 0, value: "x" };
      },
    };

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      { maxActions: 2, observeNetwork: false, strategy: "balanced" },
    );

    expect(result.graph.actions).toHaveLength(0);
  });

  test("a second fill_field on the same label is skipped without dispatch", async ({ page }) => {
    const performed: Array<{ kind: string; label?: string; value?: string }> = [];
    const recordingController = {
      page: () => page,
      goto: async (url: string) => { await page.goto(url); },
      perform: async (action: { kind: string; label?: string; value?: string }) => {
        performed.push({ kind: action.kind, label: action.label, value: action.value });
      },
      waitForSettled: async () => { /* noop */ },
      currentUrl: () => page.url(),
    };

    const { agent } = scriptedAgent([
      {
        kind: "fill_field",
        locator: { role: "textbox", name: "Email" },
        value: "{{EMAIL}}",
        label: "Email",
      },
      {
        // Same label again — should be deduped, no second dispatch.
        kind: "fill_field",
        locator: { role: "textbox", name: "Email" },
        value: "{{EMAIL}}",
        label: "Email",
      },
      { kind: "stop", reason: "done" },
    ]);

    const result = await exploreWithAgent(
      recordingController,
      agent,
      `${BASE}/`,
      {
        maxActions: 5,
        observeNetwork: false,
        strategy: "balanced",
        credentials: { EMAIL: "user@example.com" },
      },
    );

    const fills = performed.filter((p) => p.kind === "fill");
    expect(fills).toHaveLength(1);
    expect(result.graph.actions).toHaveLength(1);
  });

  test("fill_field with unresolved placeholder records a failure and does not dispatch", async ({ page }) => {
    const performed: string[] = [];
    const recordingController = {
      page: () => page,
      goto: async (url: string) => {
        await page.goto(url);
      },
      perform: async (action: { kind: string }) => {
        performed.push(action.kind);
      },
      waitForSettled: async () => {
        /* noop */
      },
      currentUrl: () => page.url(),
    };

    const { agent } = scriptedAgent([
      {
        kind: "fill_field",
        locator: { selector: "#x" },
        value: "{{NOT_PROVIDED}}",
        label: "X",
      },
      { kind: "stop", reason: "done" },
    ]);

    const result = await exploreWithAgent(
      recordingController,
      agent,
      `${BASE}/`,
      { maxActions: 5, observeNetwork: false, strategy: "balanced" },
    );

    expect(performed).not.toContain("fill");
    expect(result.graph.actions).toHaveLength(0);
  });

  test("click_locator that points at a visible candidate uses the candidate's label, not the agent's slug", async ({ page }) => {
    // Sauce Demo regression: the agent picked the data-test value as the
    // `label` in click_locator, yielding `root.click("login-button")` in
    // the generated submit/goTo helper — which won't resolve at runtime
    // because the visible text is "Login". The fix: when the locator
    // matches an existing visible candidate (e.g. by testId), reuse that
    // candidate so the recorded action.label is the visible text.
    await page.route(`${BASE}/login-page`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <input type="submit" value="Login" data-test="login-button" id="login-button">
        </body></html>`,
      });
    });

    let observed: AgentObservation | undefined;
    let cursor = 0;
    const agent: IExplorationAgent = {
      name: "click-locator-by-testid",
      async decide(o) {
        observed = o;
        cursor++;
        if (cursor === 1 && o.visibleActions.length > 0) {
          // Mirror what Sauce Demo's run produced: agent picks the data-test
          // attribute as the locator AND uses its slug as the label.
          return {
            kind: "click_locator",
            locator: { testId: "login-button" },
            label: "login-button",
          };
        }
        return { kind: "stop", reason: "done" };
      },
    };

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/login-page`,
      { maxActions: 5, observeNetwork: false, strategy: "balanced" },
    );

    // The visible candidate's label came from the planner's textOf chain —
    // for `<input type="submit" value="Login">`, that's "Login".
    const candidate = observed?.visibleActions.find((c) => c.label === "Login");
    expect(candidate).toBeDefined();

    // The persisted action should carry the visible-text label, not the slug.
    expect(result.graph.actions).toHaveLength(1);
    expect(result.graph.actions[0].label).toBe("Login");
    expect(result.graph.actions[0].label).not.toBe("login-button");
  });

  test("Slice 8C — click that navigates is recorded as actionNavigation on the FROM-state manifest", async ({ page }) => {
    // Set up two routes. Clicking "Go to next" on `/` navigates to `/next`.
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <a href="/next" id="goto">Go to next</a>
        </body></html>`,
      });
    });
    await page.route(`${BASE}/next`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body><h1>Next page</h1></body></html>`,
      });
    });

    const agent: IExplorationAgent = {
      name: "click-then-stop",
      async decide(observation) {
        if (observation.iteration === 0 && observation.visibleActions.length > 0) {
          return { kind: "click_candidate", index: 0 };
        }
        return { kind: "stop", reason: "done" };
      },
    };

    const result = await exploreWithAgent(
      new PlaywrightBrowserController(page),
      agent,
      `${BASE}/`,
      { maxActions: 5, observeNetwork: false, strategy: "balanced" },
    );

    // The originating page's manifest should now carry the navigation edge.
    const homeManifest = [...result.manifests.values()].find((m) => m.routeTemplate === "/");
    expect(homeManifest).toBeDefined();
    expect(homeManifest!.actionNavigations).toBeDefined();
    expect(homeManifest!.actionNavigations!.length).toBe(1);
    expect(homeManifest!.actionNavigations![0]).toEqual({
      triggeredBy: "Go to next",
      navigatesTo: "/next",
    });
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
