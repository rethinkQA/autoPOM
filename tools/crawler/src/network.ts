/**
 * API Dependency Discovery — optional network observation.
 *
 * Uses Playwright's page.on('response') to capture all fetch/XHR
 * requests during page load, annotating the manifest with the
 * API endpoints each page depends on.
 */

import type { Page, Response } from "playwright";
import type { ApiDependency, ApiTiming } from "./types.js";

/**
 * Observe network requests on a page and return API dependencies.
 *
 * Call this BEFORE navigating to the page. It will collect all
 * requests until `stop()` is called, then categorize them by timing.
 *
 * @param page The Playwright page to observe.
 * @returns An observer with `stop()` method that returns collected dependencies.
 */
export function observeNetwork(page: Page): NetworkObserver {
  return new NetworkObserver(page);
}

export class NetworkObserver {
  private responses: Array<{ url: string; method: string; timestamp: number; requestTimestamp: number }> = [];
  private navigationTimestamp = 0;
  private handler: ((response: Response) => void) | null = null;
  private requestHandler: ((request: import("playwright").Request) => void) | null = null;
  private started = false;
  /** Currently active action label — set by `setAction()`, cleared by `clearAction()`. */
  private currentAction: string | null = null;
  /** Maps timestamp ranges to action labels for attribution. */
  private actionLog: Array<{ label: string; start: number; end: number }> = [];
  private actionStart = 0;
  /** Track request start times by URL+method for attribution. */
  private pendingRequests = new Map<string, number>();

  constructor(private readonly page: Page) {}

  /**
   * Start observing network requests. Call before navigation.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.navigationTimestamp = Date.now();

    // Track request start times so we can attribute based on when the
    // request was initiated (not when the response arrived). This is
    // critical for submit→navigate flows where the response may arrive
    // after the page has already navigated away.
    this.requestHandler = (request: import("playwright").Request) => {
      const url = request.url();
      const method = request.method();
      if (this.isStaticResource(url)) return;
      const key = `${method}:${url}`;
      this.pendingRequests.set(key, Date.now());
    };
    this.page.on("request", this.requestHandler);

    this.handler = (response: Response) => {
      const url = response.url();
      const method = response.request().method();

      // Skip static resources
      if (this.isStaticResource(url)) return;

      // Skip same-origin page loads (HTML documents)
      const contentType = response.headers()["content-type"] ?? "";
      if (contentType.includes("text/html")) return;

      // Use request start time for attribution if available, otherwise response time
      const key = `${method}:${url}`;
      const requestTimestamp = this.pendingRequests.get(key) ?? Date.now();
      this.pendingRequests.delete(key);

      this.responses.push({
        url,
        method,
        timestamp: Date.now(),
        requestTimestamp,
      });
    };

    this.page.on("response", this.handler);
  }

  /**
   * Mark the start of a user action. API calls observed between
   * `setAction()` and `clearAction()` will be attributed to this label.
   *
   * @param label      Description of the action (e.g. "click → Save button").
   * @param lookBack   Optional ms to backdate the start time. Used by the
   *                   DomRecorder's browser→Node bridge where the action
   *                   description arrives via async IPC after the click has
   *                   already fired the fetch/form-submit request.
   */
  setAction(label: string, lookBack = 0): void {
    // Close any previous action that wasn't explicitly cleared
    if (this.currentAction) {
      this.actionLog.push({
        label: this.currentAction,
        start: this.actionStart,
        end: Date.now(),
      });
    }
    this.currentAction = label;
    this.actionStart = Date.now() - lookBack;
  }

  /**
   * Mark the end of a user action. Subsequent API calls will be
   * classified as page-load (no attribution) until the next `setAction()`.
   */
  clearAction(): void {
    if (this.currentAction) {
      this.actionLog.push({
        label: this.currentAction,
        start: this.actionStart,
        end: Date.now(),
      });
      this.currentAction = null;
    }
  }

  /**
   * Return the label of the most recent action (active or just-closed).
   * Used by the recorder to determine which action caused a navigation.
   */
  getLastActionLabel(): string | null {
    if (this.currentAction) return this.currentAction;
    if (this.actionLog.length > 0) return this.actionLog[this.actionLog.length - 1].label;
    return null;
  }

  /**
   * Stop observing and return collected API dependencies.
   *
   * @param interactionTimestamp If provided, requests after this time
   *   are classified as "interaction" instead of "page-load".
   */
  stop(interactionTimestamp?: number): ApiDependency[] {
    if (this.handler) {
      this.page.off("response", this.handler);
      this.handler = null;
    }
    if (this.requestHandler) {
      this.page.off("request", this.requestHandler);
      this.requestHandler = null;
    }

    // Close any open action
    if (this.currentAction) {
      this.actionLog.push({
        label: this.currentAction,
        start: this.actionStart,
        end: Date.now(),
      });
      this.currentAction = null;
    }

    // Deduplicate by URL pattern + method
    const seen = new Map<string, ApiDependency>();

    for (const r of this.responses) {
      const pattern = this.toPattern(r.url);
      const key = `${r.method}:${pattern}`;

      // Attribute to an action if the request was initiated within an
      // action's time window. Using requestTimestamp ensures that
      // submit→navigate flows are correctly attributed even when the
      // response arrives after the observer is stopped.
      let triggeredBy: string | undefined;
      for (let i = this.actionLog.length - 1; i >= 0; i--) {
        const action = this.actionLog[i];
        if (r.requestTimestamp >= action.start && r.requestTimestamp <= action.end + 2000) {
          triggeredBy = action.label;
          break;
        }
      }

      // If a request is attributed to an action, it's an interaction.
      // Otherwise, fall back to timestamp-based classification.
      const timing: ApiTiming = triggeredBy
        ? "interaction"
        : (interactionTimestamp && r.requestTimestamp > interactionTimestamp
          ? "interaction"
          : "page-load");

      if (!seen.has(key)) {
        seen.set(key, { pattern, method: r.method, timing, ...(triggeredBy ? { triggeredBy } : {}) });
      }
    }

    // Include pending requests that never received a response.
    // This happens when a form submission triggers navigation before the
    // response arrives — the request was captured but the response handler
    // was removed during stop(). We still want to attribute these requests.
    for (const [key, requestTimestamp] of this.pendingRequests) {
      const [method, ...urlParts] = key.split(":");
      const url = urlParts.join(":");
      const pattern = this.toPattern(url);
      const dedupKey = `${method}:${pattern}`;

      if (seen.has(dedupKey)) continue;

      let triggeredBy: string | undefined;
      for (let i = this.actionLog.length - 1; i >= 0; i--) {
        const action = this.actionLog[i];
        if (requestTimestamp >= action.start && requestTimestamp <= action.end + 2000) {
          triggeredBy = action.label;
          break;
        }
      }

      const timing: ApiTiming = triggeredBy
        ? "interaction"
        : (interactionTimestamp && requestTimestamp > interactionTimestamp
          ? "interaction"
          : "page-load");

      seen.set(dedupKey, { pattern, method, timing, ...(triggeredBy ? { triggeredBy } : {}) });
    }

    // P3-308: Clear state so the observer can be reused.
    this.responses = [];
    this.actionLog = [];
    this.pendingRequests.clear();

    return Array.from(seen.values());
  }

  /**
   * Convert a specific URL to a pattern by removing dynamic segments
   * (UUIDs, numeric IDs, query strings).
   */
  private toPattern(url: string): string {
    try {
      const u = new URL(url);
      let path = u.pathname;

      // Replace UUIDs with *
      path = path.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "*",
      );

      // Replace hex-based IDs (MongoDB ObjectIDs, hashes, short hex IDs)
      path = path.replace(/\/[0-9a-f]{8,}(?=\/|$)/gi, "/*");

      // Replace numeric IDs in path segments
      path = path.replace(/\/\d+(?=\/|$)/g, "/*");

      // Include query string pattern
      const queryKeys = Array.from(u.searchParams.keys()).sort().join(",");
      if (queryKeys) {
        return `${path}?${queryKeys}=*`;
      }

      return path;
    } catch {
      return url;
    }
  }

  /**
   * Check if a URL is for a static resource (CSS, JS, images, fonts).
   */
  private isStaticResource(url: string): boolean {
    try {
      const u = new URL(url);
      const ext = u.pathname.split(".").pop()?.toLowerCase() ?? "";
      const staticExtensions = new Set([
        "js", "mjs", "cjs", "ts",
        "css", "scss", "less",
        "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif",
        "woff", "woff2", "ttf", "eot", "otf",
        "map",
        // P2-250: removed "json" — JSON endpoints (e.g. /api/products.json)
        // are legitimate API dependencies. Use content-type filtering instead.
        "mp4", "webm", "mp3", "wav",
        "wasm",
      ]);

      // Also skip HMR websocket, vite internals, etc.
      if (u.pathname.includes("/@") || u.pathname.includes("__vite")) return true;
      if (u.pathname.startsWith("/node_modules/")) return true;
      if (u.pathname.startsWith("/_next/")) return true;

      return staticExtensions.has(ext);
    } catch {
      return false;
    }
  }
}
