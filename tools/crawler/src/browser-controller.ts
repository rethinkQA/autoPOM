/**
 * Browser controller abstraction for exploration.
 *
 * The first implementation uses Playwright directly. A future MCP-backed
 * controller can implement the same interface without changing planners,
 * graph recording, manifest merging, or drift replay.
 */

import type { Locator, Page } from "playwright";
import type { ActionLocatorHint, ExplorationAction, ExplorationActionCandidate } from "./explore-types.js";

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
        await resolveActionLocator(this._page, action.locator, action.label).click({ timeout: 5_000 });
        return;
      case "hover":
        await resolveActionLocator(this._page, action.locator, action.label).hover({ timeout: 5_000 });
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

/** Strategy chosen when resolving an `ActionLocatorHint` into a Playwright locator. */
export type LocatorStrategy = "role" | "label" | "testId" | "text" | "selector" | "none";

/** Selection result returned by {@link selectLocatorStrategy}. */
export interface LocatorSelection {
  /** Strategy that will be used by {@link resolveActionLocator}. */
  strategy: LocatorStrategy;

  /** Strategy-specific detail (e.g. role or selector value) for diagnostics. */
  detail?: string;
}

/**
 * Determine, deterministically, which replay strategy will be used for a given
 * locator hint. Pure function — does not touch a `Page` so it can be unit-tested
 * without a browser. Mirrors the priority used by {@link resolveActionLocator}.
 */
export function selectLocatorStrategy(hint: ActionLocatorHint): LocatorSelection {
  if (hint.role && hint.name) return { strategy: "role", detail: `${hint.role}:${hint.name}` };
  if (hint.label) return { strategy: "label", detail: hint.label };
  if (hint.testId) return { strategy: "testId", detail: hint.testId };
  if (hint.text) return { strategy: "text", detail: hint.text };
  if (hint.selector) return { strategy: "selector", detail: hint.selector };
  return { strategy: "none" };
}

/**
 * Resolve an `ActionLocatorHint` into a Playwright `Locator` using the priority
 * order: role+accessible name → label → test id → exact text → CSS selector.
 *
 * Throws if the hint contains no resolvable identity.
 */
export function resolveActionLocator(page: Page, hint: ActionLocatorHint, label?: string): Locator {
  const selection = selectLocatorStrategy(hint);

  switch (selection.strategy) {
    case "role":
      return page.getByRole(hint.role as Parameters<Page["getByRole"]>[0], { name: hint.name!, exact: true }).first();
    case "label":
      return page.getByLabel(hint.label!, { exact: true }).first();
    case "testId":
      return page.getByTestId(hint.testId!).first();
    case "text":
      return page.getByText(hint.text!, { exact: true }).first();
    case "selector":
      return page.locator(hint.selector!).first();
    default:
      throw new Error(`Action has no replayable locator${label ? `: ${label}` : ""}`);
  }
}
