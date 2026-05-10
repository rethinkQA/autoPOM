/**
 * Filters that drop URLs from API-dependency capture.
 *
 * The crawler observes every fetch/XHR response on the page, but most third-party
 * telemetry (Cloudflare RUM, Google Analytics, Sentry, etc.) and static assets
 * are noise — they don't represent the application's API contract and they
 * pollute `waitForReady` and `submit()` helpers in generated page objects.
 */

/** Options passed to {@link shouldDropApiUrl}. */
export interface ApiFilterOptions {
  /**
   * Page origin to compare against (e.g. `"https://app.example.com"`). When
   * provided, cross-origin URLs are dropped unless `keepThirdParty` is true.
   */
  pageOrigin?: string;

  /** When true, cross-origin requests are kept (telemetry list still applies). */
  keepThirdParty?: boolean;

  /**
   * Extra regex patterns to drop. Tested against the full URL. Caller-supplied
   * via `--ignore-api-pattern` on the CLI.
   */
  ignorePatterns?: readonly RegExp[];
}

/** Path segments that signal first-party telemetry/RUM endpoints. */
const TELEMETRY_PATH_PATTERNS: readonly RegExp[] = [
  /\/cdn-cgi\//, // Cloudflare RUM, beacon, analytics
  /\/beacon(\.|\/|$)/, // Generic beacon endpoints
  /\/__rum/, // RUM endpoints
  /\/rum-api\//,
  /\/csp-report/, // Content-Security-Policy reporting
  /\/tracking-pixel/,

  // First-party event/analytics endpoints. These often fire during user input
  // (typing, focus, blur) and get attributed to fill actions, breaking the
  // emitted submit() function. Pattern matches the widest reasonable surface
  // without catching real CRUD endpoints (`/api/orders`, `/api/users`).
  /\/api\/[a-z0-9_-]*-?events?\//i, // /api/events/, /api/summed-events/, /api/unique-events/
  /\/api\/(track|log|metrics|telemetry|analytics)(\/|$|\?)/i,
  /\/v\d+\/events?(\/|$|\?)/i, // versioned event APIs
  /\/(track|telemetry|analytics)(\/|$|\?)/i, // top-level
];

/** Hostnames whose requests are always considered noise, even on first-party paths. */
const TELEMETRY_HOSTS: readonly string[] = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "segment.io",
  "segment.com",
  "sentry.io",
  "ingest.sentry.io",
  "mixpanel.com",
  "amplitude.com",
  "hotjar.com",
  "intercom.io",
  "fullstory.com",
  "datadoghq.com",
  "newrelic.com",
  "bugsnag.com",
  "logrocket.com",
];

/** File extensions of static resources. The crawler only cares about XHR/fetch. */
const STATIC_EXTENSIONS: ReadonlySet<string> = new Set([
  "js", "mjs", "cjs", "ts",
  "css", "scss", "less",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "avif",
  "woff", "woff2", "ttf", "eot", "otf",
  "map",
  "mp4", "webm", "mp3", "wav",
  "wasm",
]);

/**
 * Returns true if a URL is a static resource. Tighter than
 * `pathname.split(".").pop()` — this matches `/foo/bar.js/v123/extra` as
 * static (the segment after the dot is `js`), which the previous check
 * missed (it would have read `js/v123/extra` as the extension).
 */
export function isStaticAssetUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  // Dev-server internals.
  if (pathname.includes("/@") || pathname.includes("__vite")) return true;
  if (pathname.startsWith("/node_modules/")) return true;
  if (pathname.startsWith("/_next/")) return true;

  // Match `.<ext>` followed by `/`, `?`, or end. Cloudflare-style cache-busting
  // appends path segments after the extension (e.g. `/beacon.min.js/v8c78df…`).
  const match = pathname.toLowerCase().match(/\.([a-z0-9]+)(?:[/?]|$)/);
  if (!match) return false;
  return STATIC_EXTENSIONS.has(match[1]);
}

/**
 * Returns true if a URL points at a known telemetry endpoint that is noise
 * for API-dependency capture, regardless of origin.
 */
export function isTelemetryUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (TELEMETRY_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }

  return TELEMETRY_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
}

/**
 * Returns true if a URL is cross-origin to the supplied page origin.
 * When `pageOrigin` is missing or unparsable, returns false (no filtering).
 */
export function isCrossOriginUrl(url: string, pageOrigin: string | undefined): boolean {
  if (!pageOrigin) return false;
  try {
    const u = new URL(url);
    const o = new URL(pageOrigin);
    return u.origin !== o.origin;
  } catch {
    return false;
  }
}

/**
 * Top-level decision: should this URL be dropped from API-dependency capture?
 *
 * Order matters — telemetry and static checks run regardless of `keepThirdParty`,
 * because they are noise even when the user wants cross-origin requests preserved.
 */
export function shouldDropApiUrl(url: string, options: ApiFilterOptions = {}): boolean {
  if (isStaticAssetUrl(url)) return true;
  if (isTelemetryUrl(url)) return true;

  if (options.ignorePatterns?.some((p) => p.test(url))) return true;

  if (!options.keepThirdParty && isCrossOriginUrl(url, options.pageOrigin)) {
    return true;
  }

  return false;
}
