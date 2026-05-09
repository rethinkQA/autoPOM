/**
 * Browser controller abstraction for exploration.
 *
 * The first implementation uses Playwright directly. A future MCP-backed
 * controller can implement the same interface without changing planners,
 * graph recording, manifest merging, or drift replay.
 */

import type { Locator, Page } from "playwright";
import type { ExplorationAction, ExplorationActionCandidate } from "./explore-types.js";

/** Browser control contract used by exploration orchestration. */
export interface IBrowserController {
  /** Return the underlying Playwright page for snapshot/discovery primitives. */
  page(): Page;

  /** Navigate to a URL and wait for the document to become usable. */
  goto(url: string): Promise<void>;

  /** Perform a candidate or recorded action. */
  perform(action: ExplorationActionCandidate | ExplorationAction): Promise<void>;

  /** Wait briefly for the page to settle after an action. */
  waitForSettled(): Promise<void>;

  /** Return the current browser URL. */
  currentUrl(): string;
}

/** Direct Playwright implementation of `IBrowserController`. */
export class PlaywrightBrowserController implements IBrowserController {
  constructor(private readonly _page: Page) {}

  page(): Page {
    return this._page;
  }

  async goto(url: string): Promise<void> {
    await this._page.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForSettled();
  }

  async perform(action: ExplorationActionCandidate | ExplorationAction): Promise<void> {
    switch (action.kind) {
      case "click":
      case "navigate":
      case "submit":
        await resolveActionLocator(this._page, action).click({ timeout: 5_000 });
        return;
      case "hover":
        await resolveActionLocator(this._page, action).hover({ timeout: 5_000 });
        return;
      default:
        throw new Error(`Unsupported exploration action kind: ${action.kind}`);
    }
  }

  async waitForSettled(): Promise<void> {
    await this._page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
    await this._page.waitForTimeout(250);
  }

  currentUrl(): string {
    return this._page.url();
  }
}

// ── Locator resolution ──────────────────────────────────────

function resolveActionLocator(page: Page, action: ExplorationActionCandidate | ExplorationAction): Locator {
  const hint = action.locator;

  if (hint.role && hint.name) {
    return page.getByRole(hint.role as Parameters<Page["getByRole"]>[0], { name: hint.name, exact: true }).first();
  }

  if (hint.label) {
    return page.getByLabel(hint.label, { exact: true }).first();
  }

  if (hint.testId) {
    return page.getByTestId(hint.testId).first();
  }

  if (hint.text) {
    return page.getByText(hint.text, { exact: true }).first();
  }

  if (hint.selector) {
    return page.locator(hint.selector).first();
  }

  throw new Error(`Action has no replayable locator: ${action.label}`);
}
