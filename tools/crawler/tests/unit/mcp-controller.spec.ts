/**
 * Unit tests for the MCP-backed browser controller.
 *
 * The factory (`mcp-factory.ts`) requires a real MCP server + Chromium and is
 * exercised via the manual smoke test instead. Here we verify the action
 * dispatch logic with a mocked `IMcpClient` and a Playwright stub.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "playwright";
import {
  McpBrowserController,
  elementDescription,
  targetFromHint,
  type IMcpClient,
  type McpToolCall,
} from "../../src/mcp-controller.js";
import type { ExplorationAction, ExplorationActionCandidate } from "../../src/explore-types.js";

// ── Test doubles ────────────────────────────────────────────

interface RecordedCall extends McpToolCall {}

class FakeMcpClient implements IMcpClient {
  public readonly calls: RecordedCall[] = [];
  public failOnTool: string | null = null;
  public missingTool: string | null = null;
  public closed = false;

  async callTool(call: McpToolCall): Promise<unknown> {
    this.calls.push({ name: call.name, arguments: { ...call.arguments } });
    if (this.missingTool === call.name) {
      throw new Error(`tool not available: ${call.name}`);
    }
    if (this.failOnTool === call.name) {
      throw new Error(`tool failed: ${call.name}`);
    }
    return { ok: true };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

interface FakePageState {
  url: string;
  loadStateCalls: number;
  waitTimeouts: number[];
}

function createFakePage(initialUrl = "http://localhost/"): { page: Page; state: FakePageState } {
  const state: FakePageState = { url: initialUrl, loadStateCalls: 0, waitTimeouts: [] };
  const fake = {
    url: () => state.url,
    waitForLoadState: async () => {
      state.loadStateCalls++;
    },
    waitForTimeout: async (ms: number) => {
      state.waitTimeouts.push(ms);
    },
  };
  return { page: fake as unknown as Page, state };
}

function makeAction(
  overrides: Partial<ExplorationAction> = {},
): ExplorationAction {
  return {
    id: "a1",
    stateId: "s1",
    kind: "click",
    label: "Sign In",
    locator: { role: "button", name: "Sign In", selector: "#sign-in" },
    reason: "test",
    risk: "safe",
    signature: "click::button::sign in",
    status: "succeeded",
    timestamp: "2026-05-09T00:00:00.000Z",
    ...overrides,
  };
}

// ── targetFromHint ──────────────────────────────────────────

test.describe("MCP — target resolution", () => {
  test("prefers test id when present", () => {
    expect(targetFromHint({ testId: "checkout", role: "button", name: "Pay", selector: "#pay" }))
      .toBe('[data-testid="checkout"]');
  });

  test("uses the recorded selector when role+name + selector both available", () => {
    // Selector is more specific than the synthetic role+aria-label combo, so
    // we keep it. Snapshot/ref resolution is a Slice 2 enhancement.
    expect(targetFromHint({ role: "button", name: "Sign In", selector: "#sign-in" }))
      .toBe("#sign-in");
  });

  test("falls back to a synthetic role+aria-label selector when no CSS selector is recorded", () => {
    expect(targetFromHint({ role: "button", name: "Continue" }))
      .toBe('[role="button"][aria-label="Continue"]');
  });

  test("falls back to aria-label, then selector, then text", () => {
    expect(targetFromHint({ label: "Email" })).toBe('[aria-label="Email"]');
    expect(targetFromHint({ selector: ".btn" })).toBe(".btn");
    expect(targetFromHint({ text: "Save" })).toBe("text=Save");
  });

  test("escapes embedded quotes in attribute values", () => {
    expect(targetFromHint({ testId: 'a"b' })).toBe('[data-testid="a\\"b"]');
    expect(targetFromHint({ label: 'a"b' })).toBe('[aria-label="a\\"b"]');
  });

  test("throws when no resolvable identity is present", () => {
    expect(() => targetFromHint({})).toThrow(/no replayable locator/);
  });

  test("elementDescription combines role and label", () => {
    expect(elementDescription(makeAction())).toBe('button "Sign In"');
    const candidate: ExplorationActionCandidate = {
      kind: "click",
      label: "Save",
      locator: { selector: "#save" },
      reason: "test",
      risk: "safe",
      signature: "click::save",
    };
    expect(elementDescription(candidate)).toBe('"Save"');
  });
});

// ── McpBrowserController ────────────────────────────────────

test.describe("MCP — controller dispatch", () => {
  test("goto invokes browser_navigate and then waits for settle", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client, { settleMs: 100 });

    await controller.goto("http://localhost:3001/products");

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]).toEqual({
      name: "browser_navigate",
      arguments: { url: "http://localhost:3001/products" },
    });
    expect(client.calls[1].name).toBe("browser_wait_for");
  });

  test("perform(click) maps to browser_click with target + element", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client, { settleMs: 50 });

    await controller.perform(makeAction({
      kind: "click",
      label: "Add Product",
      locator: { role: "button", name: "Add Product", selector: 'button[data-id="add"]' },
    }));

    const click = client.calls.find((c) => c.name === "browser_click");
    expect(click).toBeDefined();
    expect(click!.arguments).toEqual({
      target: 'button[data-id="add"]',
      element: 'button "Add Product"',
    });
  });

  test("perform(hover) maps to browser_hover", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client);

    await controller.perform(makeAction({ kind: "hover", label: "Menu", locator: { selector: "#menu" } }));

    const hover = client.calls.find((c) => c.name === "browser_hover");
    expect(hover).toBeDefined();
    expect(hover!.arguments.target).toBe("#menu");
  });

  test("perform rejects unsupported kinds", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client);

    await expect(
      controller.perform(makeAction({ kind: "press", label: "Enter", locator: { selector: "body" } })),
    ).rejects.toThrow(/Unsupported MCP action kind: press/);
  });

  test("waitForSettled falls back to the Playwright Page when browser_wait_for is unavailable", async () => {
    const { page, state } = createFakePage();
    const client = new FakeMcpClient();
    client.missingTool = "browser_wait_for";
    const controller = new McpBrowserController(page, client, { settleMs: 75 });

    await controller.waitForSettled();

    // First attempt was browser_wait_for (missing); fallback hits the page.
    expect(client.calls.map((c) => c.name)).toEqual(["browser_wait_for"]);
    expect(state.loadStateCalls).toBe(1);
    expect(state.waitTimeouts).toEqual([75]);
  });

  test("propagates tool failures from perform", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    client.failOnTool = "browser_click";
    const controller = new McpBrowserController(page, client);

    await expect(
      controller.perform(makeAction({ kind: "click" })),
    ).rejects.toThrow(/tool failed: browser_click/);
  });

  test("dispose calls client.close()", async () => {
    const { page } = createFakePage();
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client);

    await controller.dispose();
    expect(client.closed).toBe(true);
  });

  test("currentUrl reads from the Playwright Page", () => {
    const { page, state } = createFakePage("http://localhost:3001/about");
    const client = new FakeMcpClient();
    const controller = new McpBrowserController(page, client);

    expect(controller.currentUrl()).toBe("http://localhost:3001/about");
    state.url = "http://localhost:3001/contact";
    expect(controller.currentUrl()).toBe("http://localhost:3001/contact");
  });
});
