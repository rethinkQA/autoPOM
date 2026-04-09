/**
 * Page Object Emitter — transforms a CrawlerManifest into TypeScript source code.
 *
 * The emitter maps manifest groups to framework factory calls:
 * - wrapperType "group"  → group(By.css(...), page) or group(By.role(...), page)
 * - wrapperType "table"  → table(By.role("table"), page) or table(By.css(...), page)
 * - wrapperType "dialog" → dialog(By.role("dialog"), page)
 * - wrapperType "toast"  → toast(By.css(...), page)
 *
 * The emitter generates a page factory function like:
 *
 *   export function homePage(page: Page) {
 *     const root = group(By.css("body"), page);
 *     return { ...root, nav: group(By.css("nav"), page), ... };
 *   }
 */

import type { CrawlerManifest, ManifestGroup, WrapperType, ApiDependency, ActionNavigation } from "./types.js";
import type { EmitOptions } from "./emitter-types.js";
import { labelToPropertyName, deduplicateNames, inferRouteName } from "./naming.js";

// ── By-strategy inference ───────────────────────────────────

/**
 * Convert a manifest selector string into a `By.*()` call expression.
 *
 * Heuristics:
 * - Selectors that are simple tag names (nav, header, footer, main, aside)
 *   → By.role("navigation"|"banner"|"contentinfo"|"main"|"complementary")
 * - Selectors containing [role="..."] → By.role(...)
 * - Selectors with aria-label → By.role(..., { name: "..." })
 * - ID selectors (#id) → By.css("#id")
 * - Everything else → By.css(...)
 */

const TAG_TO_ROLE: Record<string, string> = {
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  // Additional HTML elements with implicit ARIA roles per WAI-ARIA spec
  dialog: "dialog",
  details: "group",
  menu: "menu",
  search: "search",
  article: "article",
  section: "region",
  // P2-251: Only use By.role("form") when the form has an accessible name.
  // Bare <form> without aria-label does not expose the "form" role per ARIA spec.
  form: "form",
  table: "table",
};

function selectorToByExpression(selector: string, group: ManifestGroup): string {
  const s = selector.trim();

  // Role-based selectors from the crawler (e.g., role="dialog")
  const roleMatch = s.match(/^\[role="([^"]+)"\]$/);
  if (roleMatch) {
    return `By.role("${roleMatch[1]}")`;
  }

  // Role with aria-label
  const roleLabelMatch = s.match(
    /^\[role="([^"]+)"\]\[aria-label="([^"]+)"\]$/,
  );
  if (roleLabelMatch) {
    return `By.role("${roleLabelMatch[1]}", { name: "${escapeStringForTs(roleLabelMatch[2])}" })`;
  }

  // Simple tag names with known ARIA roles
  // P2-251: <form> only exposes role="form" when it has an accessible name.
  // For bare `form` tag without aria-label, fall through to By.css()
  if (TAG_TO_ROLE[s] && s !== "form") {
    return `By.role("${TAG_TO_ROLE[s]}")`;
  }

  // Fieldset with aria-label → By.role("group", { name: "..." })
  // Handles the standard CSS selector emitted by discover.ts.
  const fieldsetAriaMatch = s.match(
    /^fieldset\[aria-label="([^"]+)"\]$/,
  );
  if (fieldsetAriaMatch) {
    return `By.role("group", { name: "${escapeStringForTs(fieldsetAriaMatch[1])}" })`;
  }

  // Legacy: fieldset with legend text (Playwright-specific :text-is pseudo-class).
  // Kept for backward compatibility with manifests generated before the fix.
  const fieldsetLegacyMatch = s.match(
    /^fieldset:has\(>\s*legend:text-is\("([^"]+)"\)\)$/,
  );
  if (fieldsetLegacyMatch) {
    return `By.role("group", { name: "${escapeStringForTs(fieldsetLegacyMatch[1])}" })`;
  }

  // Dialog/table by role attribute in selector
  if (group.wrapperType === "dialog" && !s.includes("role=")) {
    // For dialog wrapper types, prefer By.role("dialog")
    return `By.role("dialog")`;
  }

  if (group.wrapperType === "table") {
    // Simple table tag → By.role("table")
    if (s === "table" || s.match(/^table\b/)) {
      return `By.role("table")`;
    }
  }

  // aria-label selectors
  const ariaLabelMatch = s.match(/\[aria-label="([^"]+)"\]/);
  if (ariaLabelMatch) {
    // If it also has a role, use By.role with name
    const roleInSelector = s.match(/\[role="([^"]+)"\]/);
    if (roleInSelector) {
      return `By.role("${roleInSelector[1]}", { name: "${escapeStringForTs(ariaLabelMatch[1])}" })`;
    }
    // P2-194: check if tag portion has an implicit ARIA role
    const tagPart = s.split(/[.#\[]/)[0];
    if (tagPart && TAG_TO_ROLE[tagPart]) {
      return `By.role("${TAG_TO_ROLE[tagPart]}", { name: "${escapeStringForTs(ariaLabelMatch[1])}" })`;
    }
    return `By.label("${escapeStringForTs(ariaLabelMatch[1])}")`;
  }

  // aria-live selectors (toast)
  const ariaLiveMatch = s.match(/\[aria-live="([^"]+)"\]/);
  if (ariaLiveMatch && group.wrapperType === "toast") {
    return `By.css("${escapeStringForTs(s)}")`;
  }

  // Default: By.css(...)
  return `By.css("${escapeStringForTs(s)}")`;
}

function escapeStringForTs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\0/g, "\\0");
}

// ── Factory mapping ─────────────────────────────────────────

const WRAPPER_TO_FACTORY: Record<WrapperType, string> = {
  group: "group",
  table: "table",
  dialog: "dialog",
  toast: "toast",
  datePicker: "datePicker",
};

// ── Import collection ───────────────────────────────────────

function collectImports(groups: ManifestGroup[], apiDeps?: ApiDependency[]): Set<string> {
  const factories = new Set<string>();
  factories.add("group"); // Always need group for root
  factories.add("By");

  for (const g of groups) {
    factories.add(WRAPPER_TO_FACTORY[g.wrapperType]);
  }

  // If there are interaction API deps, we need captureTraffic for submit()
  if (apiDeps?.some(d => d.timing === "interaction" && d.triggeredBy)) {
    factories.add("captureTraffic");
  }

  return factories;
}

// ── Core emitter ────────────────────────────────────────────

/**
 * Emit a TypeScript page object file from a crawler manifest.
 */
export function emitPageObject(
  manifest: CrawlerManifest,
  options?: EmitOptions,
): string {
  const frameworkImport = options?.frameworkImport ?? "@playwright-elements/core";
  const emitWaitForReady = options?.emitWaitForReady !== false && 
    (manifest.apiDependencies?.some(d => d.timing === "page-load") ?? false);
  const generatedMarkers = options?.generatedMarkers !== false;
  const routeName = options?.routeName ?? inferRouteName(manifest.url);

  const groups = manifest.groups;

  // Build property name list (index-based to handle duplicate labels)
  const names = deduplicateNames(
    groups.map((g) => g.label),
    options?.propertyNameOverrides,
    undefined,
    groups.map((g) => g.groupType),
  );
  const nameOf = (g: ManifestGroup) => names[groups.indexOf(g)];

  // Collect needed imports
  const factories = collectImports(groups, manifest.apiDependencies);

  // Build lines
  const lines: string[] = [];

  // Header
  if (generatedMarkers) {
    lines.push(`// @generated by pw-crawl — do not edit manually`);
    lines.push(`// Source: ${manifest.url}`);
    lines.push(`// Crawled: ${manifest.timestamp}`);
    lines.push(``);
  }

  // Imports
  const sortedFactories = [...factories].sort((a, b) => {
    // By first, then alphabetical
    if (a === "By") return -1;
    if (b === "By") return 1;
    return a.localeCompare(b);
  });

  lines.push(`import type { Page } from "@playwright/test";`);
  lines.push(
    `import { ${sortedFactories.join(", ")} } from "${frameworkImport}";`,
  );
  lines.push(``);

  // Function name
  const funcName = `${routeName}Page`;

  // Emit function
  lines.push(`/**`);
  lines.push(` * ${capitalize(routeName)} page — generated from crawler manifest.`);
  if (groups.some((g) => g.notes?.includes("needs-adapter"))) {
    lines.push(` *`);
    lines.push(` * NOTE: Some elements may need adapter configuration (date pickers, etc.).`);
    lines.push(` * Check entries marked with "needs-adapter" and provide appropriate adapters.`);
  }
  lines.push(` */`);
  lines.push(`export function ${funcName}(page: Page) {`);
  lines.push(`  const root = group(By.css("body"), page);`);
  lines.push(``);
  lines.push(`  return {`);
  lines.push(`    // ── Page-level label scanning ────────────────────────────`);
  lines.push(`    ...root,`);

  // Categorize groups for organized output — mutually exclusive (P2-283)
  const emittedSet = new Set<ManifestGroup>();
  const landmarks = groups.filter((g) => {
    if (["nav", "header", "footer", "main", "aside"].includes(g.groupType) && g.wrapperType === "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const fieldsets = groups.filter((g) => {
    if (!emittedSet.has(g) && ["fieldset", "form", "region"].includes(g.groupType) && g.wrapperType === "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const specialWrappers = groups.filter((g) => {
    if (!emittedSet.has(g) && g.wrapperType !== "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const otherGroups = groups.filter((g) => !emittedSet.has(g));

  // Emit landmarks
  if (landmarks.length > 0) {
    lines.push(``);
    lines.push(`    // ── Landmarks ───────────────────────────────────────────`);
    for (const g of landmarks) {
      const propName = nameOf(g);
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${propName}: group(${byExpr}, page),`);
    }
  }

  // Emit scoped containers (fieldsets, forms, regions)
  if (fieldsets.length > 0) {
    lines.push(``);
    lines.push(`    // ── Scoped containers ───────────────────────────────────`);
    for (const g of fieldsets) {
      const propName = nameOf(g);
      const byExpr = selectorToByExpression(g.selector, g);
      const adapterComment = g.notes?.includes("needs-adapter")
        ? " // TODO: add adapter — date picker needs manual configuration"
        : "";
      lines.push(`    ${propName}: group(${byExpr}, page),${adapterComment}`);
    }
  }

  // Pre-compute table cell navigation actions (to be attached as methods on the table)
  const filteredNavs = filterAuthNavs(manifest.actionNavigations ?? []);
  const tableCellNavs = filteredNavs.filter(n => isTableCellClick(n.triggeredBy));

  // Emit typed wrappers (table, dialog, toast)
  if (specialWrappers.length > 0) {
    lines.push(``);
    lines.push(`    // ── Typed wrappers ──────────────────────────────────────`);
    for (const g of specialWrappers) {
      const propName = nameOf(g);
      const factory = WRAPPER_TO_FACTORY[g.wrapperType];
      const byExpr = selectorToByExpression(g.selector, g);
      const comment = g.notes?.includes("needs-adapter")
        ? " // TODO: add adapter — needs manual configuration"
        : g.notes
          ? ` // ${g.notes}`
          : "";

      // If this is a table with table-cell navigations, extend it with action methods
      if (g.wrapperType === "table" && tableCellNavs.length > 0) {
        lines.push(`    ${propName}: (() => {${comment}`);
        lines.push(`      const _t = ${factory}(${byExpr}, page);`);
        lines.push(`      return {`);
        lines.push(`        ..._t,`);
        for (const nav of tableCellNavs) {
          const destName = pathToFuncName(nav.navigatesTo);
          const actionName = `goTo${destName.charAt(0).toUpperCase()}${destName.slice(1)}`;
          lines.push(`        ${actionName}: async (label: string) => {`);
          lines.push(`          await (await _t.locator()).getByText(label).click();`);
          lines.push(`          await page.waitForURL(${navPathnameToRegex(nav.navigatesTo)});`);
          lines.push(`        },`);
        }
        lines.push(`      };`);
        lines.push(`    })(),`);
      } else {
        lines.push(`    ${propName}: ${factory}(${byExpr}, page),${comment}`);
      }
    }
  }

  // Emit other groups
  if (otherGroups.length > 0) {
    lines.push(``);
    lines.push(`    // ── Other groups ────────────────────────────────────────`);
    for (const g of otherGroups) {
      const propName = nameOf(g);
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${propName}: group(${byExpr}, page),`);
    }
  }

  lines.push(`  };`);
  lines.push(`}`);

  // Emit waitForReady if API dependencies exist
  if (emitWaitForReady && manifest.apiDependencies) {
    lines.push(``);
    lines.push(emitWaitForReadyFunction(manifest.apiDependencies, generatedMarkers));
  }

  // Emit submit() for interaction API dependencies
  // Skip table cell clicks and navigation-only GET clicks
  const allInteractionDeps = manifest.apiDependencies?.filter(
    (d) => d.timing === "interaction" && d.triggeredBy,
  ) ?? [];
  const interactionDeps = allInteractionDeps.filter(
    (d) => !isTableCellClick(d.triggeredBy!) &&
           !isNavigationOnlyAction(d.triggeredBy!, allInteractionDeps, manifest.actionNavigations),
  );
  if (interactionDeps.length > 0) {
    lines.push(``);
    lines.push(emitSubmitFunction(interactionDeps, funcName, generatedMarkers, undefined, manifest.actionNavigations));
  }

  // Emit navigation helper functions for non-submit navigations
  if (manifest.actionNavigations && manifest.actionNavigations.length > 0) {
    const submitTriggeredBy = interactionDeps.length > 0 ? interactionDeps[0].triggeredBy : undefined;
    const navFuncs = emitNavigationFunctions(manifest.actionNavigations, submitTriggeredBy, generatedMarkers);
    if (navFuncs) {
      lines.push(``);
      lines.push(navFuncs);
    }
  }

  lines.push(``);
  return lines.join("\n");
}

// ── waitForReady generation ─────────────────────────────────

function emitWaitForReadyFunction(
  deps: ApiDependency[],
  generatedMarkers: boolean,
  funcName = "waitForReady",
): string {
  const pageLoadDeps = deps.filter((d) => d.timing === "page-load");

  if (pageLoadDeps.length === 0) {
    return "";
  }

  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Wait for page-load API calls to complete before interacting.`);
  if (generatedMarkers) {
    lines.push(` * Generated from observed API calls — verify these patterns match your backend.`);
  }
  lines.push(` */`);
  lines.push(`export async function ${funcName}(page: Page) {`);

  if (pageLoadDeps.length === 1) {
    const dep = pageLoadDeps[0];
    // P2-121: escape dep.pattern for TS string literal
    // P2-141: strip wildcard segments so .includes() works as prefix match
    const safePattern = escapeStringForTs(dep.pattern.replace(/\/\*/g, "").replace(/\?[^=]+=\*/g, ""));
    lines.push(
      `  await page.waitForResponse(resp => resp.url().includes("${safePattern}") && resp.status() === 200);`,
    );
  } else {
    lines.push(`  await Promise.all([`);
    for (const dep of pageLoadDeps) {
      const safePattern = escapeStringForTs(dep.pattern.replace(/\/\*/g, "").replace(/\?[^=]+=\*/g, ""));
      lines.push(
        `    page.waitForResponse(resp => resp.url().includes("${safePattern}") && resp.status() === 200),`,
      );
    }
    lines.push(`  ]);`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

// ── submit() generation ─────────────────────────────────────

/**
 * Well-known auth route patterns. Navigations TO these routes are cross-cutting
 * (e.g. a Logout button in the shared header) and should not generate page-specific
 * submit/navigation functions.
 */
const AUTH_ROUTE_PATTERNS = [
  /^\/log\s*out/i,
  /^\/sign\s*out/i,
  /^\/auth\/logout/i,
  /^\/session\/end/i,
];

/** Returns true if a pathname looks like an auth/logout route. */
function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Filter out interaction deps whose triggeredBy action navigates to an auth route.
 * These are cross-cutting actions (e.g. Logout in the header) and don't belong
 * in page-specific submit functions.
 */
function filterAuthDeps(
  deps: ApiDependency[],
  actionNavigations?: ActionNavigation[],
): ApiDependency[] {
  if (!actionNavigations || actionNavigations.length === 0) return deps;
  // Build a set of triggeredBy strings that navigate to auth routes
  const authTriggers = new Set(
    actionNavigations
      .filter((n) => isAuthRoute(n.navigatesTo))
      .map((n) => n.triggeredBy),
  );
  if (authTriggers.size === 0) return deps;
  return deps.filter((d) => !d.triggeredBy || !authTriggers.has(d.triggeredBy));
}

/** Filter out action navigations to auth routes. */
function filterAuthNavs(navs: ActionNavigation[]): ActionNavigation[] {
  return navs.filter((n) => !isAuthRoute(n.navigatesTo));
}

/**
 * Parse the `triggeredBy` string to extract the button label.
 *
 * Expected format: `click on "Submit" (button)` → `"Submit"`
 */
function parseTriggeredByLabel(triggeredBy: string): string | null {
  const match = triggeredBy.match(/click on "([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Convert an ActionNavigation.navigatesTo pathname into a RegExp literal
 * suitable for `page.waitForURL(...)`.
 *
 * Strips leading slash and trailing dynamic segments (hex IDs, UUIDs)
 * to produce a stable regex: `/contactList/` for `/contactList`.
 */
function navPathnameToRegex(pathname: string): string {
  // Strip leading slash and any trailing dynamic segments (24-char hex, UUIDs, numeric IDs)
  const cleaned = pathname.replace(/^\//, "").replace(/\/[0-9a-f]{24}$/i, "").replace(/\/[0-9]+$/, "");
  // Escape forward-slashes inside the regex
  return `/${cleaned.replace(/\//g, "\\/")}/`;
}

/**
 * Emit a submit() function that wraps captureTraffic around the
 * click action observed during crawling.
 */
function emitSubmitFunction(
  deps: ApiDependency[],
  pageFuncName: string,
  generatedMarkers: boolean,
  funcName?: string,
  actionNavigations?: ActionNavigation[],
): string {
  const lines: string[] = [];

  // Use the first interaction dep to determine the button label
  const primaryDep = deps[0];
  const buttonLabel = parseTriggeredByLabel(primaryDep.triggeredBy!) ?? "Submit";
  const exportName = funcName ?? "submit";

  // Find if the submit action causes navigation
  const navTarget = actionNavigations?.find(
    (n) => n.triggeredBy === primaryDep.triggeredBy,
  );

  lines.push(`/**`);
  lines.push(` * Submit the form and capture API traffic.`);
  if (generatedMarkers) {
    lines.push(` * Generated from observed interaction:`);
    for (const dep of deps) {
      lines.push(` *   ${dep.method} ${dep.pattern} ← ${dep.triggeredBy}`);
    }
  }
  lines.push(` */`);
  lines.push(`export async function ${exportName}(page: Page) {`);
  lines.push(`  const root = group(By.css("body"), page);`);
  if (navTarget) {
    lines.push(`  return captureTraffic(page, async () => {`);
    lines.push(`    await root.click("${escapeStringForTs(buttonLabel)}");`);
    lines.push(`    await page.waitForURL(${navPathnameToRegex(navTarget.navigatesTo)});`);
    lines.push(`  });`);
  } else {
    lines.push(`  return captureTraffic(page, () => root.click("${escapeStringForTs(buttonLabel)}"));`);
  }
  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Emit standalone navigation helper functions for action navigations
 * that are NOT covered by the submit function (i.e. navigation-only actions
 * like clicking "Add a New Contact").
 */
/**
 * Derive a camelCase function name from a URL pathname.
 * Unlike inferRouteName, preserves existing camelCase in path segments
 * (e.g. "/contactDetails" → "contactDetails").
 */
function pathToFuncName(pathname: string): string {
  const cleaned = pathname.replace(/^\/+|\/+$/g, "").replace(/\/[0-9a-f]{24}$/i, "").replace(/\/[0-9]+$/, "");
  if (!cleaned) return "home";
  const segments = cleaned.split("/").filter(Boolean);
  return segments
    .map((seg, i) => {
      if (i === 0) return seg;
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join("");
}

/**
 * Detect whether a triggeredBy action is a table cell/row click (dynamic data).
 * Returns true for patterns like `click on "some text" (td)` or `(tr)`.
 */
function isTableCellClick(triggeredBy: string): boolean {
  return /\((td|tr)\)\s*$/.test(triggeredBy);
}

/**
 * Check whether an action is a pure navigation click (all deps are GETs and
 * the same action has a matching actionNavigation). Navigation-only clicks
 * should emit a goTo*() helper, not a submit().
 */
function isNavigationOnlyAction(
  triggeredBy: string,
  allDeps: ApiDependency[],
  actionNavigations?: ActionNavigation[],
): boolean {
  if (!actionNavigations || actionNavigations.length === 0) return false;
  // Must have a matching navigation
  const hasNav = actionNavigations.some(n => n.triggeredBy === triggeredBy);
  if (!hasNav) return false;
  // All deps for this action must be GETs (page loads from navigation, not mutations)
  const actionDeps = allDeps.filter(d => d.triggeredBy === triggeredBy);
  return actionDeps.length > 0 && actionDeps.every(d => d.method === "GET");
}

function emitNavigationFunctions(
  actionNavigations: ActionNavigation[],
  submitTriggeredBy: string | undefined,
  generatedMarkers: boolean,
): string {
  const lines: string[] = [];

  for (const nav of actionNavigations) {
    // Skip navigations already handled by submit()
    if (nav.triggeredBy === submitTriggeredBy) continue;

    // Skip table cell clicks — they are emitted as methods on the table element
    if (isTableCellClick(nav.triggeredBy)) continue;

    const buttonLabel = parseTriggeredByLabel(nav.triggeredBy);
    if (!buttonLabel) continue;

    const destName = pathToFuncName(nav.navigatesTo);
    const funcName = `goTo${destName.charAt(0).toUpperCase()}${destName.slice(1)}`;

    lines.push(`/**`);
    lines.push(` * Click "${buttonLabel}" and wait for navigation.`);
    if (generatedMarkers) {
      lines.push(` * Generated from observed navigation: ${nav.triggeredBy} → ${nav.navigatesTo}`);
    }
    lines.push(` */`);
    lines.push(`export async function ${funcName}(page: Page) {`);
    lines.push(`  const root = group(By.css("body"), page);`);
    lines.push(`  await root.click("${escapeStringForTs(buttonLabel)}");`);
    lines.push(`  await page.waitForURL(${navPathnameToRegex(nav.navigatesTo)});`);
    lines.push(`}`);
  }

  return lines.join("\n");
}

// ── Template detection ──────────────────────────────────────

import type { RouteManifest, ShapeEntry, DetectedTemplate } from "./emitter-types.js";

/**
 * Compute the shape signature of a manifest — sorted list of
 * (wrapperType, selectorPattern) tuples, ignoring label text.
 */
export function computeShape(manifest: CrawlerManifest): ShapeEntry[] {
  return manifest.groups
    .map((g) => ({
      wrapperType: g.wrapperType,
      selectorPattern: normalizeSelectorPattern(g.selector),
    }))
    .sort((a, b) => {
      const typeCmp = a.wrapperType.localeCompare(b.wrapperType);
      if (typeCmp !== 0) return typeCmp;
      return a.selectorPattern.localeCompare(b.selectorPattern);
    });
}

/**
 * Normalize a selector to a pattern for shape comparison.
 * Strips specific IDs, text content, etc. to match structural equivalents.
 */
function normalizeSelectorPattern(selector: string): string {
  return selector
    .replace(/:text-is\("[^"]*"\)/g, ":text-is(*)") // legacy legend text → wildcard
    .replace(/#[a-zA-Z0-9_-]+/g, "#*")               // IDs → wildcard
    .replace(/\[aria-label="[^"]*"\]/g, "[aria-label=*]"); // aria-label values → wildcard
}

/**
 * Compute a string key for a shape (for grouping routes by identical shapes).
 */
function shapeKey(shape: ShapeEntry[]): string {
  // Use \x00 (null byte) as separator to avoid collisions with characters
  // that can appear in CSS selectors (e.g. '|' in [lang|="en"]).
  return shape.map((s) => `${s.wrapperType}:${s.selectorPattern}`).join("\x00");
}

/**
 * Detect templates shared across multiple routes.
 *
 * Groups routes by identical shape signatures. Routes with the same
 * shape get a shared template. Routes with unique shapes get standalone
 * page objects.
 */
export function detectTemplates(routes: RouteManifest[]): {
  templates: DetectedTemplate[];
  standalone: RouteManifest[];
} {
  // Group by shape
  const byShape = new Map<string, RouteManifest[]>();
  const shapeCache = new Map<string, ShapeEntry[]>();

  for (const route of routes) {
    const shape = computeShape(route.manifest);
    const key = shapeKey(shape);
    shapeCache.set(key, shape);

    if (!byShape.has(key)) {
      byShape.set(key, []);
    }
    byShape.get(key)!.push(route);
  }

  const templates: DetectedTemplate[] = [];
  const standalone: RouteManifest[] = [];

  for (const [key, routeGroup] of byShape) {
    if (routeGroup.length < 2) {
      standalone.push(...routeGroup);
      continue;
    }

    // These routes share a shape — extract template
    const shape = shapeCache.get(key)!;
    const templateName = generateTemplateName(routeGroup);

    // Determine fixed vs varying labels
    const fixedLabels = new Map<string, string>();
    const varyingLabels = new Map<string, Map<string, string>>();

    // P1-292: Use positional index instead of normalized-selector find()
    // to avoid wrong-group matching when two groups share the same normalized pattern.
    const refGroups = routeGroup[0].manifest.groups;

    for (let i = 0; i < refGroups.length; i++) {
      const selector = refGroups[i].selector;

      // Check if all routes have the same label for this positional group
      const labelsByRoute = new Map<string, string>();
      let allSame = true;
      const firstLabel = refGroups[i].label;

      for (const route of routeGroup) {
        const matchingGroup = route.manifest.groups[i];
        if (matchingGroup) {
          labelsByRoute.set(route.route, matchingGroup.label);
          if (matchingGroup.label !== firstLabel) {
            allSame = false;
          }
        }
      }

      if (allSame) {
        fixedLabels.set(selector, firstLabel);
      } else {
        varyingLabels.set(selector, labelsByRoute);
      }
    }

    templates.push({
      name: templateName,
      routes: routeGroup.map((r) => r.route),
      shape,
      varyingLabels,
      fixedLabels,
    });
  }

  return { templates, standalone };
}

function generateTemplateName(routes: RouteManifest[]): string {
  // Simple heuristic: if all routes are short names, combine them
  // Otherwise use a generic "sharedTemplate"
  if (routes.length <= 3) {
    const names = routes.map((r) => capitalize(r.route));
    return `shared${names.join("")}Template`;
  }
  return "sharedPageTemplate";
}

/**
 * Emit TypeScript for a detected template + per-route page objects.
 */
export function emitTemplate(
  template: DetectedTemplate,
  routeManifests: RouteManifest[],
  options?: EmitOptions,
): string {
  const frameworkImport = options?.frameworkImport ?? "@playwright-elements/core";
  const generatedMarkers = options?.generatedMarkers !== false;
  const lines: string[] = [];

  if (generatedMarkers) {
    lines.push(`// @generated by pw-crawl — do not edit manually`);
    lines.push(`// Template shared by routes: ${template.routes.join(", ")}`);
    lines.push(``);
  }

  // Collect all factories needed
  const factories = new Set<string>(["group", "By"]);
  for (const rm of routeManifests) {
    for (const g of rm.manifest.groups) {
      factories.add(WRAPPER_TO_FACTORY[g.wrapperType]);
    }
    if (rm.manifest.apiDependencies?.some(d => d.timing === "interaction" && d.triggeredBy)) {
      factories.add("captureTraffic");
    }
  }

  const sortedFactories = [...factories].sort((a, b) => {
    if (a === "By") return -1;
    if (b === "By") return 1;
    return a.localeCompare(b);
  });

  lines.push(`import type { Page } from "@playwright/test";`);
  lines.push(
    `import { ${sortedFactories.join(", ")} } from "${frameworkImport}";`,
  );
  lines.push(``);

  // Build deduplicated config property names for varying labels.
  // Multiple selectors can produce the same base name (e.g. two groups
  // with label "Add Contact"), so we deduplicate with numeric suffixes.
  const configPropNames = new Map<string, string>();
  if (template.varyingLabels.size > 0) {
    const usedNames = new Set<string>();
    for (const [selector, labelsByRoute] of template.varyingLabels) {
      let propName = labelToPropertyName(
        [...labelsByRoute.values()][0],
      ) + "Label";
      if (usedNames.has(propName)) {
        let suffix = 2;
        while (usedNames.has(`${propName}${suffix}`)) suffix++;
        propName = `${propName}${suffix}`;
      }
      usedNames.add(propName);
      configPropNames.set(selector, propName);
    }
  }

  // If there are varying labels, emit config interface
  if (template.varyingLabels.size > 0) {
    lines.push(`interface TemplateConfig {`);
    for (const [selector] of template.varyingLabels) {
      lines.push(`  ${configPropNames.get(selector)!}: string;`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  // Emit template factory
  const configParam = template.varyingLabels.size > 0
    ? ", config: TemplateConfig"
    : "";
  lines.push(`function ${template.name}(page: Page${configParam}) {`);
  lines.push(`  const root = group(By.css("body"), page);`);
  lines.push(``);
  lines.push(`  return {`);
  lines.push(`    ...root,`);

  // Use the first route as reference for group order
  const refManifest = routeManifests.find(
    (rm) => rm.route === template.routes[0],
  )?.manifest;
  if (refManifest) {
    const names = deduplicateNames(
      refManifest.groups.map((g) => g.label),
      options?.propertyNameOverrides,
      undefined,
      refManifest.groups.map((g) => g.groupType),
    );

    // P1-291: Build map of group selector → config property name
    // so we can wire config values into the template body.
    // Uses the deduplicated configPropNames map built above.
    const selectorToConfigProp = new Map<string, string>();
    for (const [selector] of template.varyingLabels) {
      selectorToConfigProp.set(selector, configPropNames.get(selector)!);
    }

    for (const [i, g] of refManifest.groups.entries()) {
      const propName = names[i];
      const factory = WRAPPER_TO_FACTORY[g.wrapperType];
      const configProp = selectorToConfigProp.get(g.selector);
      if (configProp) {
        // Use config value for groups with varying labels
        lines.push(`    ${propName}: ${factory}(By.label(config.${configProp}), page),`);
      } else {
        const byExpr = selectorToByExpression(g.selector, g);
        lines.push(`    ${propName}: ${factory}(${byExpr}, page),`);
      }
    }
  }

  lines.push(`  };`);
  lines.push(`}`);

  // Emit per-route factories
  for (const rm of routeManifests) {
    lines.push(``);
    const funcName = `${rm.route}Page`;
    if (template.varyingLabels.size > 0) {
      const configEntries: string[] = [];
      for (const [selector, labelsByRoute] of template.varyingLabels) {
        const propName = configPropNames.get(selector)!;
        const label = labelsByRoute.get(rm.route) ?? "";
        configEntries.push(`${propName}: "${label}"`);
      }
      lines.push(
        `export const ${funcName} = (page: Page) => ${template.name}(page, { ${configEntries.join(", ")} });`,
      );
    } else {
      lines.push(
        `export const ${funcName} = (page: Page) => ${template.name}(page);`,
      );
    }

    // Emit waitForReady + interaction comments per-route
    const emitWFR = options?.emitWaitForReady !== false &&
      (rm.manifest.apiDependencies?.some(d => d.timing === "page-load") ?? false);
    if (emitWFR && rm.manifest.apiDependencies) {
      lines.push(``);
      lines.push(emitWaitForReadyFunction(rm.manifest.apiDependencies, generatedMarkers, `${rm.route}WaitForReady`));
    }
    const filteredRouteNavs = filterAuthNavs(rm.manifest.actionNavigations ?? []);
    const allRouteDeps = rm.manifest.apiDependencies?.filter(
      (d) => d.timing === "interaction" && d.triggeredBy,
    ) ?? [];
    const interactionDeps = filterAuthDeps(
      allRouteDeps.filter(
        (d) => !isTableCellClick(d.triggeredBy!) &&
               !isNavigationOnlyAction(d.triggeredBy!, allRouteDeps, rm.manifest.actionNavigations),
      ),
      rm.manifest.actionNavigations,
    );
    if (interactionDeps.length > 0) {
      lines.push(``);
      lines.push(emitSubmitFunction(interactionDeps, `${rm.route}Page`, generatedMarkers, `${rm.route}Submit`, filteredRouteNavs));
    }

    // Emit navigation helper functions for non-submit navigations
    if (filteredRouteNavs.length > 0) {
      const submitTriggeredBy = interactionDeps.length > 0 ? interactionDeps[0].triggeredBy : undefined;
      const navFuncs = emitNavigationFunctions(filteredRouteNavs, submitTriggeredBy, generatedMarkers);
      if (navFuncs) {
        lines.push(``);
        lines.push(navFuncs);
      }
    }
  }

  lines.push(``);
  return lines.join("\n");
}

// ── Shared component extraction ─────────────────────────────

/**
 * A group that appears on multiple pages and should be extracted
 * into a shared component file (e.g., nav bar, header, footer).
 */
interface SharedComponent {
  /** Normalized selector pattern used as the dedup key. */
  selectorPattern: string;
  /** Representative ManifestGroup (from the first manifest encountered). */
  group: ManifestGroup;
  /** Property name for this component. */
  propName: string;
  /** Routes this component appears on. */
  routes: string[];
}

/**
 * Scan all route manifests and extract groups that appear on 2+ pages.
 *
 * Uses exact selector + wrapperType matching (NOT normalized patterns)
 * so that structurally similar elements with different IDs (e.g. #add-contact
 * vs #contactDetails) are NOT falsely merged as shared.
 * Semantic selectors (tag names, roles) naturally match across pages.
 *
 * Returns shared components sorted by frequency (most common first).
 */
function extractSharedGroups(routes: RouteManifest[]): SharedComponent[] {
  // key = wrapperType + exact selector → which routes have it
  const seen = new Map<string, { group: ManifestGroup; routes: string[] }>();

  for (const route of routes) {
    for (const g of route.manifest.groups) {
      const key = `${g.wrapperType}::${g.selector}`;
      const entry = seen.get(key);
      if (entry) {
        if (!entry.routes.includes(route.route)) {
          entry.routes.push(route.route);
        }
      } else {
        seen.set(key, { group: g, routes: [route.route] });
      }
    }
  }

  // Only keep groups appearing on 2+ pages
  const shared: SharedComponent[] = [];
  const usedNames = new Set<string>();

  for (const [selectorPattern, entry] of seen) {
    if (entry.routes.length < 2) continue;

    let propName = labelToPropertyName(entry.group.label);
    if (usedNames.has(propName)) {
      let suffix = 2;
      while (usedNames.has(`${propName}${suffix}`)) suffix++;
      propName = `${propName}${suffix}`;
    }
    usedNames.add(propName);

    shared.push({
      selectorPattern,
      group: entry.group,
      propName,
      routes: entry.routes,
    });
  }

  // Sort: most common first
  shared.sort((a, b) => b.routes.length - a.routes.length);
  return shared;
}

/**
 * Emit a `shared-components.ts` file with reusable component factories.
 *
 * Each shared component becomes a function that takes `page: Page` and
 * returns the wrapped element:
 *
 *   export function sharedNav(page: Page) {
 *     return group(By.role("navigation"), page);
 *   }
 */
function emitSharedComponentsFile(
  shared: SharedComponent[],
  options?: EmitOptions,
): string {
  const frameworkImport = options?.frameworkImport ?? "@playwright-elements/core";
  const generatedMarkers = options?.generatedMarkers !== false;
  const lines: string[] = [];

  if (generatedMarkers) {
    lines.push(`// @generated by pw-crawl — do not edit manually`);
    lines.push(`// Shared components extracted from multiple page manifests`);
    lines.push(``);
  }

  // Collect factories
  const factories = new Set<string>(["group", "By"]);
  for (const comp of shared) {
    factories.add(WRAPPER_TO_FACTORY[comp.group.wrapperType]);
  }
  const sortedFactories = [...factories].sort((a, b) => {
    if (a === "By") return -1;
    if (b === "By") return 1;
    return a.localeCompare(b);
  });

  lines.push(`import type { Page } from "@playwright/test";`);
  lines.push(`import { ${sortedFactories.join(", ")} } from "${frameworkImport}";`);
  lines.push(``);

  for (const comp of shared) {
    const funcName = `shared${capitalize(comp.propName)}`;
    const factory = WRAPPER_TO_FACTORY[comp.group.wrapperType];
    const byExpr = selectorToByExpression(comp.group.selector, comp.group);

    lines.push(`/** Appears on: ${comp.routes.join(", ")} */`);
    lines.push(`export function ${funcName}(page: Page) {`);
    lines.push(`  return ${factory}(${byExpr}, page);`);
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Check if a manifest group matches a shared component
 * (same wrapperType + normalized selector).
 */
function isSharedGroup(group: ManifestGroup, sharedSet: Set<string>): boolean {
  const key = `${group.wrapperType}::${group.selector}`;
  return sharedSet.has(key);
}

/**
 * Emit a page object that imports and composes shared components.
 * Page-specific groups are declared inline; shared groups come from imports.
 */
function emitPageObjectWithShared(
  manifest: CrawlerManifest,
  shared: SharedComponent[],
  sharedKeys: Set<string>,
  options?: EmitOptions,
): string {
  const frameworkImport = options?.frameworkImport ?? "@playwright-elements/core";
  const generatedMarkers = options?.generatedMarkers !== false;
  const emitWaitForReady = options?.emitWaitForReady !== false &&
    (manifest.apiDependencies?.some(d => d.timing === "page-load") ?? false);
  const routeName = options?.routeName ?? inferRouteName(manifest.url);

  const groups = manifest.groups;
  const pageSpecific = groups.filter((g) => !isSharedGroup(g, sharedKeys));
  const sharedOnThisPage = shared.filter((comp) =>
    groups.some((g) => {
      const key = `${g.wrapperType}::${g.selector}`;
      return key === comp.selectorPattern;
    }),
  );

  // Collect needed imports for page-specific groups only
  const factories = new Set<string>(["group", "By"]);
  for (const g of pageSpecific) {
    factories.add(WRAPPER_TO_FACTORY[g.wrapperType]);
  }
  if (manifest.apiDependencies?.some(d => d.timing === "interaction" && d.triggeredBy)) {
    factories.add("captureTraffic");
  }

  // Collect shared component prop names so page-specific names avoid them
  const sharedPropNames = new Set(sharedOnThisPage.map((comp) => comp.propName));

  const names = deduplicateNames(
    pageSpecific.map((g) => g.label),
    options?.propertyNameOverrides,
    sharedPropNames,
    pageSpecific.map((g) => g.groupType),
  );

  const lines: string[] = [];

  if (generatedMarkers) {
    lines.push(`// @generated by pw-crawl — do not edit manually`);
    lines.push(`// Source: ${manifest.url}`);
    lines.push(`// Crawled: ${manifest.timestamp}`);
    lines.push(``);
  }

  // Imports
  const sortedFactories = [...factories].sort((a, b) => {
    if (a === "By") return -1;
    if (b === "By") return 1;
    return a.localeCompare(b);
  });

  lines.push(`import type { Page } from "@playwright/test";`);
  lines.push(`import { ${sortedFactories.join(", ")} } from "${frameworkImport}";`);

  // Import shared components
  if (sharedOnThisPage.length > 0) {
    const sharedImports = sharedOnThisPage
      .map((comp) => `shared${capitalize(comp.propName)}`)
      .sort();
    lines.push(`import { ${sharedImports.join(", ")} } from "./shared-components.js";`);
  }

  lines.push(``);

  const funcName = `${routeName}Page`;
  lines.push(`/**`);
  lines.push(` * ${capitalize(routeName)} page — generated from crawler manifest.`);
  lines.push(` */`);
  lines.push(`export function ${funcName}(page: Page) {`);
  lines.push(`  const root = group(By.css("body"), page);`);
  lines.push(``);
  lines.push(`  return {`);
  lines.push(`    ...root,`);

  // Emit shared components first
  if (sharedOnThisPage.length > 0) {
    lines.push(``);
    lines.push(`    // ── Shared components ───────────────────────────────────`);
    for (const comp of sharedOnThisPage) {
      const funcRef = `shared${capitalize(comp.propName)}`;
      lines.push(`    ${comp.propName}: ${funcRef}(page),`);
    }
  }

  // Categorize page-specific groups
  const emittedSet = new Set<ManifestGroup>();
  const landmarks = pageSpecific.filter((g) => {
    if (["nav", "header", "footer", "main", "aside"].includes(g.groupType) && g.wrapperType === "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const fieldsets = pageSpecific.filter((g) => {
    if (!emittedSet.has(g) && ["fieldset", "form", "region"].includes(g.groupType) && g.wrapperType === "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const specialWrappers = pageSpecific.filter((g) => {
    if (!emittedSet.has(g) && g.wrapperType !== "group") {
      emittedSet.add(g);
      return true;
    }
    return false;
  });
  const otherGroups = pageSpecific.filter((g) => !emittedSet.has(g));

  if (landmarks.length > 0) {
    lines.push(``);
    lines.push(`    // ── Landmarks ───────────────────────────────────────────`);
    for (const g of landmarks) {
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${names[pageSpecific.indexOf(g)]}: group(${byExpr}, page),`);
    }
  }

  if (fieldsets.length > 0) {
    lines.push(``);
    lines.push(`    // ── Scoped containers ───────────────────────────────────`);
    for (const g of fieldsets) {
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${names[pageSpecific.indexOf(g)]}: group(${byExpr}, page),`);
    }
  }

  // Pre-compute table cell navigation actions (to be attached as methods on the table)
  const filteredNavs2 = filterAuthNavs(manifest.actionNavigations ?? []);
  const tableCellNavs2 = filteredNavs2.filter(n => isTableCellClick(n.triggeredBy));

  if (specialWrappers.length > 0) {
    lines.push(``);
    lines.push(`    // ── Typed wrappers ──────────────────────────────────────`);
    for (const g of specialWrappers) {
      const factory = WRAPPER_TO_FACTORY[g.wrapperType];
      const byExpr = selectorToByExpression(g.selector, g);
      const propName = names[pageSpecific.indexOf(g)];

      if (g.wrapperType === "table" && tableCellNavs2.length > 0) {
        lines.push(`    ${propName}: (() => {`);
        lines.push(`      const _t = ${factory}(${byExpr}, page);`);
        lines.push(`      return {`);
        lines.push(`        ..._t,`);
        for (const nav of tableCellNavs2) {
          const destName = pathToFuncName(nav.navigatesTo);
          const actionName = `goTo${destName.charAt(0).toUpperCase()}${destName.slice(1)}`;
          lines.push(`        ${actionName}: async (label: string) => {`);
          lines.push(`          await (await _t.locator()).getByText(label).click();`);
          lines.push(`          await page.waitForURL(${navPathnameToRegex(nav.navigatesTo)});`);
          lines.push(`        },`);
        }
        lines.push(`      };`);
        lines.push(`    })(),`);
      } else {
        lines.push(`    ${propName}: ${factory}(${byExpr}, page),`);
      }
    }
  }

  if (otherGroups.length > 0) {
    lines.push(``);
    lines.push(`    // ── Other groups ────────────────────────────────────────`);
    for (const g of otherGroups) {
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${names[pageSpecific.indexOf(g)]}: group(${byExpr}, page),`);
    }
  }

  lines.push(`  };`);
  lines.push(`}`);

  // Emit waitForReady if API dependencies exist
  if (emitWaitForReady && manifest.apiDependencies) {
    lines.push(``);
    lines.push(emitWaitForReadyFunction(manifest.apiDependencies, generatedMarkers));
  }

  // Emit submit() for interaction API dependencies
  // Skip table cell clicks and navigation-only GET clicks
  const allInteractionDeps3 = manifest.apiDependencies?.filter(
    (d) => d.timing === "interaction" && d.triggeredBy,
  ) ?? [];
  const interactionDeps = filterAuthDeps(
    allInteractionDeps3.filter(
      (d) => !isTableCellClick(d.triggeredBy!) &&
             !isNavigationOnlyAction(d.triggeredBy!, allInteractionDeps3, manifest.actionNavigations),
    ),
    manifest.actionNavigations,
  );
  if (interactionDeps.length > 0) {
    lines.push(``);
    lines.push(emitSubmitFunction(interactionDeps, funcName, generatedMarkers, undefined, filteredNavs2));
  }

  // Emit navigation helper functions for non-submit navigations
  if (filteredNavs2.length > 0) {
    const submitTriggeredBy = interactionDeps.length > 0 ? interactionDeps[0].triggeredBy : undefined;
    const navFuncs = emitNavigationFunctions(filteredNavs2, submitTriggeredBy, generatedMarkers);
    if (navFuncs) {
      lines.push(``);
      lines.push(navFuncs);
    }
  }

  lines.push(``);
  return lines.join("\n");
}

// ── Multi-route emit ────────────────────────────────────────

/**
 * Emit page objects from multiple route manifests.
 *
 * 1. Extracts shared components (groups appearing on 2+ pages)
 *    → emits `shared-components.ts`
 * 2. Detects full-page templates (routes with identical shapes)
 *    → emits shared template files with per-route wrappers
 * 3. Emits standalone page objects for remaining routes
 *    → page-specific groups inline, shared groups imported
 *
 * Returns a Map from filename → TypeScript source code.
 */
export function emitMultiRoute(
  routes: RouteManifest[],
  options?: EmitOptions,
): Map<string, string> {
  const result = new Map<string, string>();

  if (routes.length === 0) return result;

  // Single route — just emit standalone (no shared extraction possible)
  if (routes.length === 1) {
    const route = routes[0];
    const filename = `${route.route}.ts`;
    result.set(
      filename,
      emitPageObject(route.manifest, {
        ...options,
        routeName: route.route,
      }),
    );
    return result;
  }

  // Step 1: Extract shared components
  const shared = extractSharedGroups(routes);
  const sharedKeys = new Set(shared.map((s) => s.selectorPattern));

  if (shared.length > 0) {
    result.set("shared-components.ts", emitSharedComponentsFile(shared, options));
  }

  // Step 2: Detect full-page templates (still useful for routes with truly
  // identical structure after shared extraction)
  const { templates, standalone } = detectTemplates(routes);

  // Step 3: Emit template files (these already handle their own shared logic)
  for (const template of templates) {
    const filename = `${template.name}.ts`;
    const relevantManifests = routes.filter((r) =>
      template.routes.includes(r.route),
    );
    result.set(
      filename,
      emitTemplate(template, relevantManifests, options),
    );
  }

  // Step 4: Emit standalone page objects — composing shared components
  for (const route of standalone) {
    const filename = `${route.route}.ts`;
    if (shared.length > 0) {
      result.set(
        filename,
        emitPageObjectWithShared(route.manifest, shared, sharedKeys, {
          ...options,
          routeName: route.route,
        }),
      );
    } else {
      result.set(
        filename,
        emitPageObject(route.manifest, {
          ...options,
          routeName: route.route,
        }),
      );
    }
  }

  return result;
}

// ── Utilities ───────────────────────────────────────────────

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
