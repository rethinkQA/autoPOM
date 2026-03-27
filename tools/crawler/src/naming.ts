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
 * Infer a route name from a URL path.
 *
 * Examples:
 *   "http://localhost:3001/"       → "home"
 *   "http://localhost:3001/#about" → "about"
 *   "http://localhost:3001/about"  → "about"
 *   "http://localhost:3001/products/123" → "productsDetail"
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

    // Split into segments and build camelCase
    const segments = path.split("/").filter((s) => s.length > 0);

    if (segments.length === 0) {
      return "home";
    }

    // If it looks like a detail page (last segment is numeric or UUID)
    const lastSegment = segments[segments.length - 1];
    if (/^[0-9]+$/.test(lastSegment) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastSegment)) {
      segments[segments.length - 1] = "detail";
    }

    return segments
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
