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

import type { CrawlerManifest, ManifestGroup, WrapperType, ApiDependency } from "./types.js";
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

function collectImports(groups: ManifestGroup[]): Set<string> {
  const factories = new Set<string>();
  factories.add("group"); // Always need group for root
  factories.add("By");

  for (const g of groups) {
    factories.add(WRAPPER_TO_FACTORY[g.wrapperType]);
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
  );
  const nameOf = (g: ManifestGroup) => names[groups.indexOf(g)];

  // Collect needed imports
  const factories = collectImports(groups);

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
      lines.push(`    ${propName}: ${factory}(${byExpr}, page),${comment}`);
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

  lines.push(``);
  return lines.join("\n");
}

// ── waitForReady generation ─────────────────────────────────

function emitWaitForReadyFunction(
  deps: ApiDependency[],
  generatedMarkers: boolean,
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
  lines.push(`export async function waitForReady(page: Page) {`);

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

  // If there are varying labels, emit config interface
  if (template.varyingLabels.size > 0) {
    lines.push(`interface TemplateConfig {`);
    for (const [_selector, labelsByRoute] of template.varyingLabels) {
      const propName = labelToPropertyName(
        [...labelsByRoute.values()][0],
      ) + "Label";
      lines.push(`  ${propName}: string;`);
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
    );

    // P1-291: Build map of group selector → config property name
    // so we can wire config values into the template body.
    const selectorToConfigProp = new Map<string, string>();
    for (const [selector, labelsByRoute] of template.varyingLabels) {
      const configPropName = labelToPropertyName(
        [...labelsByRoute.values()][0],
      ) + "Label";
      selectorToConfigProp.set(selector, configPropName);
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
      for (const [_selector, labelsByRoute] of template.varyingLabels) {
        const propName = labelToPropertyName(
          [...labelsByRoute.values()][0],
        ) + "Label";
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
 * Comparison uses the same normalizeSelectorPattern() as template detection
 * (strips IDs, aria-label values, text content) so a nav bar with slightly
 * different aria-label values across pages still gets recognized as shared.
 *
 * Returns shared components sorted by frequency (most common first).
 */
function extractSharedGroups(routes: RouteManifest[]): SharedComponent[] {
  // key = wrapperType + normalized selector → which routes have it
  const seen = new Map<string, { group: ManifestGroup; routes: string[] }>();

  for (const route of routes) {
    for (const g of route.manifest.groups) {
      const key = `${g.wrapperType}::${normalizeSelectorPattern(g.selector)}`;
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
  const key = `${group.wrapperType}::${normalizeSelectorPattern(group.selector)}`;
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
  const routeName = options?.routeName ?? inferRouteName(manifest.url);

  const groups = manifest.groups;
  const pageSpecific = groups.filter((g) => !isSharedGroup(g, sharedKeys));
  const sharedOnThisPage = shared.filter((comp) =>
    groups.some((g) => {
      const key = `${g.wrapperType}::${normalizeSelectorPattern(g.selector)}`;
      return key === comp.selectorPattern;
    }),
  );

  // Collect needed imports for page-specific groups only
  const factories = new Set<string>(["group", "By"]);
  for (const g of pageSpecific) {
    factories.add(WRAPPER_TO_FACTORY[g.wrapperType]);
  }

  const names = deduplicateNames(
    pageSpecific.map((g) => g.label),
    options?.propertyNameOverrides,
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

  if (specialWrappers.length > 0) {
    lines.push(``);
    lines.push(`    // ── Typed wrappers ──────────────────────────────────────`);
    for (const g of specialWrappers) {
      const factory = WRAPPER_TO_FACTORY[g.wrapperType];
      const byExpr = selectorToByExpression(g.selector, g);
      lines.push(`    ${names[pageSpecific.indexOf(g)]}: ${factory}(${byExpr}, page),`);
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
    const filename = `${route.route}-page.ts`;
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
    const filename = `${route.route}-page.ts`;
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
