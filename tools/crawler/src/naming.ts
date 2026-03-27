/**
 * Name utilities — convert manifest labels to valid TypeScript identifiers.
 *
 * The label "Shipping Method" becomes `shippingMethod`.
 * The label "product-modal" becomes `productModal`.
 * The label "toast-notification" becomes `toastNotification`.
 * The label "GeneralStore Vanilla HTML" becomes `generalStoreVanillaHtml`.
 */

// Words that are TypeScript reserved and cannot be used as property names
const RESERVED_WORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends",
  "false", "finally", "for", "function", "if", "implements", "import",
  "in", "instanceof", "interface", "let", "new", "null", "package",
  "private", "protected", "public", "return", "static", "super",
  "switch", "this", "throw", "true", "try", "typeof", "undefined",
  "var", "void", "while", "with", "yield",
  // Modern keywords that cause confusion as property names
  "await", "async", "of", "from",
  // Common Playwright/framework names we don't want to shadow
  "page", "test", "expect",
]);

/**
 * Convert a manifest label to a valid camelCase TypeScript property name.
 *
 * Examples:
 *   "Shipping Method"     → "shippingMethod"
 *   "product-modal"       → "productModal"
 *   "toast-notification"  → "toastNotification"
 *   "GeneralStore Vanilla HTML" → "generalStoreVanillaHtml"
 *   "nav"                 → "nav"
 *   "main"                → "mainContent" (reserved word gets suffix)
 *   "footer"              → "footer"
 *   "table"               → "tableGroup" (or contextual based on wrapperType)
 *   ""                    → "unnamed"
 */
export function labelToPropertyName(label: string): string {
  if (!label || label.trim().length === 0) {
    return "unnamed";
  }

  // Normalize Unicode: decompose accented characters (NFD), strip combining
  // marks to produce ASCII-safe equivalents (e.g. é→e, ü→u), then remove
  // remaining non-printable-ASCII characters (CJK, emoji, symbols, etc.).
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ascii = normalized.replace(/[^\x20-\x7E]/g, " ");

  // If stripping left nothing meaningful, fall back to "unnamed"
  if (!ascii.trim()) {
    return "unnamed";
  }

  // Split on whitespace, hyphens, underscores, dots, and camelCase boundaries
  const words = ascii
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase split
    .split(/[\s\-_.,;:!?'"()[\]{}/\\]+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return "unnamed";
  }

  // Build camelCase: first word lowercase, subsequent words Title case
  const camel = words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");

  // Handle reserved words
  if (RESERVED_WORDS.has(camel)) {
    return camel + "Section";
  }

  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(camel)) {
    return "_" + camel;
  }

  return camel;
}

/**
 * Deduplicate property names by appending numeric suffixes.
 * Returns an array of unique property names indexed by position.
 */
export function deduplicateNames(
  labels: string[],
  overrides?: Record<string, string>,
): string[] {
  const result: string[] = [];
  const usedNames = new Set<string>();

  for (const label of labels) {
    // Check for override first
    if (overrides?.[label]) {
      const name = overrides[label];
      result.push(name);
      usedNames.add(name);
      continue;
    }

    let name = labelToPropertyName(label);

    // Deduplicate
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name}${suffix}`)) {
        suffix++;
      }
      name = `${name}${suffix}`;
    }

    result.push(name);
    usedNames.add(name);
  }

  return result;
}

/**
 * Infer a short route name from a URL path.
 *
 * Uses only the last 1–2 meaningful segments to keep names concise:
 *   "/"                              → "home"
 *   "/about"                         → "about"
 *   "/#about"                        → "about"
 *   "/products/list"                 → "productsList"
 *   "/products/123"                  → "products"
 *   "/admin/rackraj/buildings/detail" → "buildings"
 *   "/admin/rackraj/buildings/:id"   → "buildings"
 *   "/devices/:id/edit"              → "devices"
 */
export function inferRouteName(url: string): string {
  try {
    // Support both full URLs and bare pathnames
    const parsed = url.startsWith("/") ? new URL(url, "http://localhost") : new URL(url);
    let path = parsed.pathname;

    // Check hash-based routing first
    if (parsed.hash && parsed.hash.length > 1) {
      path = parsed.hash.slice(1); // remove leading #
    }

    // Root path → "home"
    if (path === "/" || path === "") {
      return "home";
    }

    // Remove leading/trailing slashes
    path = path.replace(/^\/+|\/+$/g, "");

    // Split into segments
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) return "home";

    // Strip dynamic-looking segments (IDs, :id placeholders, "detail")
    const meaningful = segments.filter(
      (s) => s !== ":id" && s !== "detail" && !/^\d+$/.test(s) &&
        !/^[0-9a-f]{8}-/i.test(s),
    );

    if (meaningful.length === 0) return "home";

    // Take last 2 meaningful segments at most
    const tail = meaningful.slice(-2);

    return tail
      .map((seg, i) => {
        const lower = seg.toLowerCase();
        if (i === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
  } catch {
    return "page";
  }
}

/**
 * Extract the pathname from a URL, stripping origin and query parameters.
 * Returns "/" on parse failure.
 */
export function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

// ── Dynamic segment detection ────────────────────────────────

/** Matches segments that are purely numeric (IDs). */
const NUMERIC_ID = /^\d+$/;

/** Matches UUIDs (8-4-4-4-12 hex). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches hex strings ≥8 chars (common short IDs, hashes). */
const HEX_ID = /^[0-9a-f]{8,}$/i;

/** Matches MongoDB ObjectIds (24 hex chars). */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Matches base64-like tokens ≥16 chars (JWT segments, encoded IDs). */
const BASE64_TOKEN = /^[A-Za-z0-9_-]{16,}$/;

/**
 * Test whether a single URL path segment looks like a dynamic value
 * (ID, UUID, hash) rather than a named route.
 */
function isDynamicSegment(segment: string): boolean {
  return (
    NUMERIC_ID.test(segment) ||
    UUID.test(segment) ||
    OBJECT_ID.test(segment) ||
    HEX_ID.test(segment) ||
    // Long base64 tokens that mix letters+digits — but NOT normal words
    (BASE64_TOKEN.test(segment) && /\d/.test(segment) && /[a-zA-Z]/.test(segment))
  );
}

/**
 * Normalize a URL into a route template.
 *
 * Collapses dynamic segments (numeric IDs, UUIDs, hashes) into `:id`
 * placeholders so that `/devices/123` and `/devices/456` map to the
 * same route template `/devices/:id`.
 *
 * Returns `{ page, state }` where:
 *   - `page`  = the template with dynamic segments collapsed (used for grouping)
 *   - `state` = the original pathname (used for manifest metadata)
 *
 * Works generically with any URL structure — no app-specific patterns.
 *
 * Examples:
 *   "/devices"              → { page: "/devices" }
 *   "/devices/123"          → { page: "/devices/:id" }
 *   "/devices/123/edit"     → { page: "/devices/:id/edit" }
 *   "/admin/buildings"      → { page: "/admin/buildings" }
 *   "/users/550e8400-e29b-41d4-a716-446655440000" → { page: "/users/:id" }
 *   "/"                     → { page: "/" }
 */
export function normalizeRoute(url: string): { page: string; pathname: string } {
  let pathname: string;
  try {
    const parsed = url.startsWith("/") ? new URL(url, "http://localhost") : new URL(url);
    pathname = parsed.pathname;

    // Handle hash-based routing (e.g. /#/devices/123)
    if (parsed.hash && parsed.hash.startsWith("#/")) {
      pathname = parsed.hash.slice(1); // "#/foo" → "/foo"
    }
  } catch {
    pathname = url;
  }

  // Normalize trailing slashes (but keep root as "/")
  const clean = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

  // Split, collapse dynamic segments, rejoin
  const segments = clean.split("/").filter((s) => s.length > 0);
  const normalized = segments.map((s) => (isDynamicSegment(s) ? ":id" : s));
  const page = "/" + normalized.join("/");

  return { page, pathname: clean || "/" };
}
