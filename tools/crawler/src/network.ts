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
  private responses: Array<{ url: string; method: string; timestamp: number }> = [];
  private navigationTimestamp = 0;
  private handler: ((response: Response) => void) | null = null;
  private started = false;

  constructor(private readonly page: Page) {}

  /**
   * Start observing network requests. Call before navigation.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.navigationTimestamp = Date.now();

    this.handler = (response: Response) => {
      const url = response.url();
      const method = response.request().method();

      // Skip static resources
      if (this.isStaticResource(url)) return;

      // Skip same-origin page loads (HTML documents)
      const contentType = response.headers()["content-type"] ?? "";
      if (contentType.includes("text/html")) return;

      this.responses.push({
        url,
        method,
        timestamp: Date.now(),
      });
    };

    this.page.on("response", this.handler);
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

    // Deduplicate by URL pattern + method
    const seen = new Map<string, ApiDependency>();

    for (const r of this.responses) {
      const pattern = this.toPattern(r.url);
      const key = `${r.method}:${pattern}`;

      const timing: ApiTiming =
        interactionTimestamp && r.timestamp > interactionTimestamp
          ? "interaction"
          : "page-load";

      if (!seen.has(key)) {
        seen.set(key, { pattern, method: r.method, timing });
      }
    }

    // P3-308: Clear state so the observer can be reused.
    this.responses = [];

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
