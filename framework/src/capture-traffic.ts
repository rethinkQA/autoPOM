/**
 * Traffic capture utility — capture and assert on API calls during an action.
 *
 * Wraps a UI action (or any async callback), hooks into Playwright's
 * request/response lifecycle, waits for the network to settle, and
 * returns all captured HTTP traffic for assertion.
 *
 * ## Usage
 *
 * ```ts
 * import { captureTraffic } from "@playwright-elements/core";
 *
 * const traffic = await captureTraffic(page, async () => {
 *   await po.settingsForm.click("Save");
 * });
 *
 * // Assert on captured requests
 * expect(traffic.requests).toHaveLength(2);
 * expect(traffic.byUrl("/api/devices").method).toBe("PUT");
 * expect(traffic.byUrl("/api/devices").requestBody).toEqual({ name: "Sensor-A" });
 * expect(traffic.byUrl("/api/audit-log").responseStatus).toBe(200);
 * ```
 *
 * @module
 */

import type { Page, Request, Response } from "@playwright/test";

import {
  NETWORK_IDLE_TIME_MS,
  NETWORK_SETTLE_TIMEOUT_MS,
} from "./timeouts.js";

// ── Types ───────────────────────────────────────────────────

/** A single captured HTTP exchange (request + response). */
export interface CapturedRequest {
  /** Full URL of the request. */
  url: string;

  /** HTTP method (GET, POST, PUT, DELETE, etc.). */
  method: string;

  /** Request headers. */
  requestHeaders: Record<string, string>;

  /** Parsed request body (JSON if parseable, raw string otherwise, null if empty). */
  requestBody: unknown;

  /** HTTP response status code (0 if request failed before response). */
  responseStatus: number;

  /** Response headers. */
  responseHeaders: Record<string, string>;

  /** Parsed response body (JSON if parseable, raw string otherwise, null if not available). */
  responseBody: unknown;

  /** Timestamp when the request was initiated. */
  timestamp: number;

  /** Duration in milliseconds from request to response. */
  duration: number;

  /** Whether the request failed (e.g. network error, CORS, aborted). */
  failed: boolean;
}

/** Options for {@link captureTraffic}. */
export interface CaptureTrafficOptions {
  /**
   * Milliseconds with zero pending requests before traffic capture
   * completes. Same semantics as `networkSettleMiddleware.idleTime`.
   *
   * @default 300
   */
  idleTime?: number;

  /**
   * Maximum time (ms) to wait for network to settle after the action.
   *
   * @default 10_000
   */
  timeout?: number;

  /**
   * URL patterns to ignore (analytics, telemetry, etc.).
   * Each entry can be a `RegExp` or a `string` (tested with `url.includes()`).
   */
  ignore?: (RegExp | string)[];
}

/** Result object from traffic capture, with query helpers. */
export interface CapturedTraffic {
  /** All captured HTTP exchanges, in chronological order. */
  requests: CapturedRequest[];

  /**
   * Find the first request whose URL contains the given substring.
   * Throws if no match is found.
   */
  byUrl(urlSubstring: string): CapturedRequest;

  /**
   * Find all requests whose URL contains the given substring.
   */
  allByUrl(urlSubstring: string): CapturedRequest[];

  /**
   * Find the first request matching a method + URL substring.
   * Throws if no match is found.
   */
  byMethodAndUrl(method: string, urlSubstring: string): CapturedRequest;

  /**
   * Find all requests matching a method + URL substring.
   */
  allByMethodAndUrl(method: string, urlSubstring: string): CapturedRequest[];
}

// ── Static resource filter ──────────────────────────────────

const STATIC_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts",
  "css", "scss", "less",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif",
  "woff", "woff2", "ttf", "eot", "otf",
  "map",
  "mp4", "webm", "mp3", "wav",
  "wasm",
]);

function isStaticResource(url: string): boolean {
  try {
    const u = new URL(url);
    const ext = u.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (u.pathname.includes("/@") || u.pathname.includes("__vite")) return true;
    if (u.pathname.startsWith("/node_modules/")) return true;
    if (u.pathname.startsWith("/_next/")) return true;
    return STATIC_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

// ── Core implementation ─────────────────────────────────────

/**
 * Capture all API traffic that occurs during an action.
 *
 * Hooks into Playwright's request/response lifecycle, executes the
 * provided action, waits for the network to settle, then returns
 * all captured HTTP exchanges for assertion.
 *
 * Static resources (JS, CSS, images, fonts) and HTML documents are
 * automatically filtered out — only API/data requests are captured.
 *
 * @param page    The Playwright Page to monitor.
 * @param action  Async callback that triggers the network activity.
 * @param options Configuration for settle timing and ignore patterns.
 * @returns       Captured traffic with query helpers.
 */
export async function captureTraffic(
  page: Page,
  action: () => Promise<void>,
  options?: CaptureTrafficOptions,
): Promise<CapturedTraffic> {
  const idleTime = options?.idleTime ?? NETWORK_IDLE_TIME_MS;
  const timeout = options?.timeout ?? NETWORK_SETTLE_TIMEOUT_MS;
  const ignore = options?.ignore;

  const captured: CapturedRequest[] = [];
  const pending = new Map<Request, { url: string; method: string; timestamp: number }>();

  let settleResolve: (() => void) | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let actionComplete = false;
  let hadRequests = false;

  function shouldIgnore(url: string): boolean {
    if (isStaticResource(url)) return true;
    if (!ignore) return false;
    return ignore.some((p) =>
      typeof p === "string" ? url.includes(p) : p.test(url),
    );
  }

  function checkSettle() {
    if (!actionComplete) return;
    if (pending.size === 0 && !settled) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        settled = true;
        clearTimeout(timeoutTimer);
        settleResolve?.();
      }, idleTime);
    }
  }

  const onRequest = (req: Request) => {
    const url = req.url();
    if (shouldIgnore(url)) return;

    // Skip HTML document requests
    const resourceType = req.resourceType();
    if (resourceType === "document") return;

    hadRequests = true;
    pending.set(req, {
      url,
      method: req.method(),
      timestamp: Date.now(),
    });
    clearTimeout(idleTimer);
  };

  const onResponse = async (resp: Response) => {
    const req = resp.request();
    const info = pending.get(req);
    if (!info) return;
    pending.delete(req);

    // Capture the exchange
    let requestBody: unknown = null;
    try {
      const postData = req.postData();
      if (postData) {
        try { requestBody = JSON.parse(postData); } catch { requestBody = postData; }
      }
    } catch { /* no body */ }

    let responseBody: unknown = null;
    try {
      const bodyText = await resp.text();
      if (bodyText) {
        try { responseBody = JSON.parse(bodyText); } catch { responseBody = bodyText; }
      }
    } catch { /* body not available */ }

    captured.push({
      url: info.url,
      method: info.method,
      requestHeaders: req.headers(),
      requestBody,
      responseStatus: resp.status(),
      responseHeaders: resp.headers(),
      responseBody,
      timestamp: info.timestamp,
      duration: Date.now() - info.timestamp,
      failed: false,
    });

    checkSettle();
  };

  const onRequestFailed = (req: Request) => {
    const info = pending.get(req);
    if (!info) return;
    pending.delete(req);

    let requestBody: unknown = null;
    try {
      const postData = req.postData();
      if (postData) {
        try { requestBody = JSON.parse(postData); } catch { requestBody = postData; }
      }
    } catch { /* no body */ }

    captured.push({
      url: info.url,
      method: info.method,
      requestHeaders: req.headers(),
      requestBody,
      responseStatus: 0,
      responseHeaders: {},
      responseBody: null,
      timestamp: info.timestamp,
      duration: Date.now() - info.timestamp,
      failed: true,
    });

    checkSettle();
  };

  // Start listening
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  const settlePromise = new Promise<void>((resolve) => {
    settleResolve = resolve;
    timeoutTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, timeout);
  });

  try {
    // Execute the action
    await action();

    // Signal action complete — start settle detection
    actionComplete = true;
    if (!hadRequests && pending.size === 0) {
      settled = true;
      clearTimeout(timeoutTimer);
      settleResolve?.();
    } else {
      // Two event-loop deferrals (same pattern as networkSettleMiddleware)
      setTimeout(() => setTimeout(() => checkSettle(), 0), 0);
    }

    // Wait for network to settle
    await settlePromise;
  } finally {
    // Cleanup
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
    clearTimeout(idleTimer);
    clearTimeout(timeoutTimer);
    if (!settled) {
      settled = true;
      settleResolve?.();
    }
  }

  // Sort by timestamp
  captured.sort((a, b) => a.timestamp - b.timestamp);

  // Build result with query helpers
  return buildCapturedTraffic(captured);
}

// ── Query helpers ───────────────────────────────────────────

function buildCapturedTraffic(requests: CapturedRequest[]): CapturedTraffic {
  return {
    requests,

    byUrl(urlSubstring: string): CapturedRequest {
      const match = requests.find((r) => r.url.includes(urlSubstring));
      if (!match) {
        const urls = requests.map((r) => `  ${r.method} ${r.url}`).join("\n");
        throw new Error(
          `No captured request matching URL "${urlSubstring}".\n` +
          `Captured ${requests.length} request(s):\n${urls || "  (none)"}`,
        );
      }
      return match;
    },

    allByUrl(urlSubstring: string): CapturedRequest[] {
      return requests.filter((r) => r.url.includes(urlSubstring));
    },

    byMethodAndUrl(method: string, urlSubstring: string): CapturedRequest {
      const upperMethod = method.toUpperCase();
      const match = requests.find(
        (r) => r.method === upperMethod && r.url.includes(urlSubstring),
      );
      if (!match) {
        const urls = requests.map((r) => `  ${r.method} ${r.url}`).join("\n");
        throw new Error(
          `No captured request matching ${upperMethod} "${urlSubstring}".\n` +
          `Captured ${requests.length} request(s):\n${urls || "  (none)"}`,
        );
      }
      return match;
    },

    allByMethodAndUrl(method: string, urlSubstring: string): CapturedRequest[] {
      const upperMethod = method.toUpperCase();
      return requests.filter(
        (r) => r.method === upperMethod && r.url.includes(urlSubstring),
      );
    },
  };
}
