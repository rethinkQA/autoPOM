/**
 * MCP-backed browser controller (Slice 1: action channel).
 *
 * Plumbs `IBrowserController` through Microsoft's Playwright MCP server
 * (`@playwright/mcp`). The server speaks JSON-RPC tool calls over stdio; this
 * module hides that behind a small `IMcpClient` shim so the controller is
 * unit-testable without spawning a real subprocess.
 *
 * Browser sharing model: the factory launches Chromium with
 * `--remote-debugging-port=<n>`, attaches MCP via `--cdp-endpoint`, and
 * attaches Playwright via `connectOverCDP`. Both speak to the same browser,
 * so existing crawler discovery (`crawlPage`, `extractActionCandidates`)
 * keeps working unchanged on the Playwright `Page`.
 *
 * Slice 1 limits:
 *   - Only `click`, `hover`, `navigate`, and `submit` action kinds are wired.
 *   - Targeting uses a single string selector per the MCP `target` field
 *     (which accepts "an element reference from the page snapshot OR a unique
 *     element selector"). Snapshot/ref resolution is a future enhancement.
 *   - The AI tool-use planner is Slice 2.
 */

import type { Page } from "playwright";
import type { IBrowserController } from "./browser-controller.js";
import type {
  ActionLocatorHint,
  ExplorationAction,
  ExplorationActionCandidate,
} from "./explore-types.js";

// ── MCP client contract ─────────────────────────────────────

/** Tool-call shape used by `McpBrowserController`. */
export interface McpToolCall {
  /** Tool name, e.g. `browser_click`. */
  name: string;

  /** Tool arguments object. */
  arguments: Record<string, unknown>;
}

/**
 * Minimal MCP client surface the controller depends on.
 *
 * A real implementation wraps `@modelcontextprotocol/sdk`'s `Client.callTool`;
 * tests inject a stub that records calls and returns canned responses.
 */
export interface IMcpClient {
  /** Invoke a tool on the server. Throws on protocol error or tool failure. */
  callTool(call: McpToolCall): Promise<unknown>;

  /** Best-effort cleanup. Called by `dispose()`. */
  close?(): Promise<void>;
}

// ── Hint → MCP target ───────────────────────────────────────

/**
 * Convert an `ActionLocatorHint` to the single string `target` argument that
 * MCP browser action tools expect. Priority mirrors the Playwright controller
 * (role+name → label → testId → text → selector) but emits CSS-style synthetic
 * selectors for the first four because MCP `target` is a single string, not
 * structured fields.
 */
export function targetFromHint(hint: ActionLocatorHint): string {
  if (hint.testId) return `[data-testid="${escapeAttr(hint.testId)}"]`;

  if (hint.role && hint.name) {
    // Synthetic role+name selector. Real-MCP may prefer a snapshot ref here;
    // we fall through to selector below if MCP rejects this form.
    const escapedRole = escapeAttr(hint.role);
    const escapedName = escapeAttr(hint.name);
    if (hint.selector) {
      // Prefer the more specific CSS selector when available; the role/name
      // attributes are still useful for human-readable `element` arg.
      return hint.selector;
    }
    return `[role="${escapedRole}"][aria-label="${escapedName}"]`;
  }

  if (hint.label) return `[aria-label="${escapeAttr(hint.label)}"]`;

  if (hint.selector) return hint.selector;

  if (hint.text) {
    // No reliable CSS form for "exact text"; emit a Playwright-style text
    // selector. Real-MCP may not accept this and the action will surface a
    // clean tool error which `perform()` re-throws.
    return `text=${hint.text}`;
  }

  throw new Error("Action has no replayable locator for MCP target");
}

/** Build the human-readable `element` argument MCP uses for logging. */
export function elementDescription(
  action: ExplorationAction | ExplorationActionCandidate,
): string {
  const role = action.locator.role ? `${action.locator.role} ` : "";
  return `${role}"${action.label}"`.trim();
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Controller ──────────────────────────────────────────────

/** Options for `McpBrowserController`. */
export interface McpControllerOptions {
  /** Default settle delay (ms) after each action when MCP didn't already wait. */
  settleMs?: number;
}

/**
 * `IBrowserController` implementation that dispatches navigation and
 * interaction commands through an MCP server while delegating page snapshots
 * and discovery to a co-attached Playwright `Page`.
 */
export class McpBrowserController implements IBrowserController {
  private readonly _page: Page;
  private readonly _client: IMcpClient;
  private readonly _settleMs: number;

  constructor(page: Page, client: IMcpClient, options: McpControllerOptions = {}) {
    this._page = page;
    this._client = client;
    this._settleMs = options.settleMs ?? 250;
  }

  page(): Page {
    return this._page;
  }

  async goto(url: string): Promise<void> {
    await this._client.callTool({ name: "browser_navigate", arguments: { url } });
    await this.waitForSettled();
  }

  async perform(action: ExplorationActionCandidate | ExplorationAction): Promise<void> {
    const target = targetFromHint(action.locator);
    const element = elementDescription(action);

    switch (action.kind) {
      case "click":
      case "navigate":
      case "submit":
        await this._client.callTool({
          name: "browser_click",
          arguments: { target, element },
        });
        return;
      case "hover":
        await this._client.callTool({
          name: "browser_hover",
          arguments: { target, element },
        });
        return;
      case "fill": {
        if (action.value === undefined) {
          throw new Error(`fill action "${action.label}" missing value`);
        }
        await this._client.callTool({
          name: "browser_type",
          arguments: { target, element, text: action.value },
        });
        return;
      }
      default:
        throw new Error(`Unsupported MCP action kind: ${action.kind}`);
    }
  }

  async waitForSettled(): Promise<void> {
    // Prefer MCP's wait so the same browser session sees the settle.
    try {
      await this._client.callTool({
        name: "browser_wait_for",
        arguments: { time: Math.max(0.1, this._settleMs / 1000) },
      });
      return;
    } catch {
      // Some MCP capability sets omit `browser_wait_for`; fall back to the
      // co-attached Playwright Page.
    }
    await this._page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
    await this._page.waitForTimeout(this._settleMs);
  }

  currentUrl(): string {
    return this._page.url();
  }

  /** Best-effort cleanup; safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this._client.close) {
      await this._client.close().catch(() => {});
    }
  }
}
