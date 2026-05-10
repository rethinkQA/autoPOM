/**
 * Pure-function tests for the Anthropic exploration agent: tool_use → decision
 * translation and observation formatting. The full agent (which calls the
 * Messages API) is exercised via documented manual smoke runs, not unit tests.
 */

import { test, expect } from "@playwright/test";
import {
  buildAnthropicRequest,
  extractDecision,
  formatObservationMessage,
} from "../../src/ai/agent-anthropic.js";
import type { AgentObservation } from "../../src/agent-types.js";

// ── extractDecision ─────────────────────────────────────────

test.describe("Anthropic agent — extractDecision", () => {
  test("translates a click_candidate tool_use", () => {
    const decision = extractDecision({
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "click_candidate",
          input: { index: 2, rationale: "looks promising" },
        },
      ],
    });
    expect(decision).toEqual({
      kind: "click_candidate",
      index: 2,
      rationale: "looks promising",
    });
  });

  test("sanitizes click_locator input to a valid ActionLocatorHint", () => {
    const decision = extractDecision({
      content: [
        {
          type: "tool_use",
          id: "tu_2",
          name: "click_locator",
          input: {
            locator: {
              role: "button",
              name: "Add Product",
              extra: 123, // ignored
            },
            label: "Add Product",
            rationale: "candidate not listed",
          },
        },
      ],
    });
    expect(decision).toEqual({
      kind: "click_locator",
      locator: { role: "button", name: "Add Product" },
      label: "Add Product",
      rationale: "candidate not listed",
    });
  });

  test("translates fill_field with sanitized locator and required value", () => {
    const decision = extractDecision({
      content: [
        {
          type: "tool_use",
          id: "tu_5",
          name: "fill_field",
          input: {
            locator: { role: "textbox", name: "Email", garbage: 1 },
            value: "{{EMAIL}}",
            label: "Email",
            rationale: "login form",
          },
        },
      ],
    });
    expect(decision).toEqual({
      kind: "fill_field",
      locator: { role: "textbox", name: "Email" },
      value: "{{EMAIL}}",
      label: "Email",
      rationale: "login form",
    });
  });

  test("translates navigate", () => {
    const decision = extractDecision({
      content: [
        {
          type: "tool_use",
          id: "tu_3",
          name: "navigate",
          input: { url: "/products" },
        },
      ],
    });
    expect(decision).toEqual({ kind: "navigate", url: "/products", rationale: undefined });
  });

  test("translates stop with default reason when missing", () => {
    const decision = extractDecision({
      content: [
        { type: "tool_use", id: "tu_4", name: "stop", input: {} },
      ],
    });
    expect(decision).toEqual({
      kind: "stop",
      reason: "agent stopped without explicit reason",
    });
  });

  test("returns null when no tool_use block is present", () => {
    expect(
      extractDecision({
        content: [{ type: "text", text: "I am thinking about it." }],
      }),
    ).toBeNull();
  });

  test("throws on missing required fields", () => {
    expect(() =>
      extractDecision({
        content: [{ type: "tool_use", id: "x", name: "click_candidate", input: {} }],
      }),
    ).toThrow(/missing numeric "index"/);

    expect(() =>
      extractDecision({
        content: [
          { type: "tool_use", id: "x", name: "click_locator", input: { locator: { role: "button" } } },
        ],
      }),
    ).toThrow(/missing string "label"/);
  });
});

// ── formatObservationMessage ────────────────────────────────

test.describe("Anthropic agent — formatObservationMessage", () => {
  function makeObservation(overrides: Partial<AgentObservation> = {}): AgentObservation {
    return {
      iteration: 0,
      url: "http://localhost:3001/",
      routeTemplate: "/",
      title: "Demo",
      manifestGroupKeys: [],
      visibleActions: [],
      recentHistory: [],
      budget: { actionsRemaining: 20, maxActions: 20 },
      ...overrides,
    };
  }

  test("includes URL, title, and budget", () => {
    const text = formatObservationMessage(makeObservation({ title: "Login" }));
    expect(text).toContain("URL: http://localhost:3001/");
    expect(text).toContain("Route template: /");
    expect(text).toContain("Title: Login");
    expect(text).toContain("actions remaining: 20/20");
  });

  test("renders visible action candidates with index and risk", () => {
    const text = formatObservationMessage(
      makeObservation({
        visibleActions: [
          {
            index: 0,
            kind: "click",
            label: "Sign In",
            role: "button",
            risk: "safe",
            signature: "click::button::sign in",
          },
          {
            index: 1,
            kind: "navigate",
            label: "About",
            role: "link",
            risk: "navigation",
            signature: "navigate::link::about",
          },
        ],
      }),
    );
    expect(text).toContain('[0] button "Sign In" — kind=click risk=safe');
    expect(text).toContain('[1] link "About" — kind=navigate risk=navigation');
  });

  test("renders recent history rows compactly", () => {
    const text = formatObservationMessage(
      makeObservation({
        recentHistory: [
          {
            iteration: 3,
            decision: { kind: "click_candidate", index: 2 },
            outcome: "success",
          },
          {
            iteration: 4,
            decision: { kind: "navigate", url: "/about" },
            outcome: "navigated",
          },
          {
            iteration: 5,
            decision: { kind: "click_locator", label: "Custom" },
            outcome: "failed",
            note: "selector did not match",
          },
        ],
      }),
    );
    expect(text).toContain("#3 click_candidate(2) → success");
    expect(text).toContain("#4 navigate(/about) → navigated");
    expect(text).toContain('#5 click_locator("Custom") → failed (selector did not match)');
  });

  test("falls back to 'no candidates' message when visibleActions is empty", () => {
    const text = formatObservationMessage(makeObservation());
    expect(text).toContain("No visible action candidates");
  });
});

// ── buildAnthropicRequest ───────────────────────────────────

test.describe("Anthropic agent — buildAnthropicRequest", () => {
  function makeObservation(overrides: Partial<AgentObservation> = {}): AgentObservation {
    return {
      iteration: 0,
      url: "http://localhost/",
      routeTemplate: "/",
      title: "Demo",
      manifestGroupKeys: [],
      visibleActions: [],
      recentHistory: [],
      budget: { actionsRemaining: 10, maxActions: 10 },
      ...overrides,
    };
  }

  test("emits system as a text-block array with cache_control by default", () => {
    const body = buildAnthropicRequest(makeObservation(), {
      model: "claude-sonnet-4-20250514",
      maxTokens: 512,
      systemPrompt: "system text",
      toolChoice: { type: "auto" },
      enablePromptCache: true,
    });

    expect(body.system).toEqual([
      { type: "text", text: "system text", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
  });

  test("omits cache_control when caching is disabled", () => {
    const body = buildAnthropicRequest(makeObservation(), {
      model: "claude-sonnet-4-20250514",
      maxTokens: 512,
      systemPrompt: "system text",
      toolChoice: { type: "auto" },
      enablePromptCache: false,
    });

    expect(body.system).toEqual([{ type: "text", text: "system text" }]);
  });

  test("user message contains the formatted observation", () => {
    const observation = makeObservation({ url: "http://localhost/products", title: "Products" });
    const body = buildAnthropicRequest(observation, {
      model: "claude-sonnet-4-20250514",
      maxTokens: 512,
      systemPrompt: "sys",
      toolChoice: { type: "auto" },
      enablePromptCache: true,
    });

    const block = body.messages[0].content[0];
    expect(block).toMatchObject({ type: "text" });
    if (block.type === "text") {
      expect(block.text).toContain("URL: http://localhost/products");
      expect(block.text).toContain("Title: Products");
    }
  });
});
