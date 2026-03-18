/**
 * Types for the Page Object Emitter (Phase 12).
 *
 * The emitter transforms a CrawlerManifest into TypeScript page object
 * source code that imports from @playwright-elements/core.
 */

// ── Emit options ────────────────────────────────────────────

export interface EmitOptions {
  /**
   * Module specifier for the framework import.
   * Default: "@playwright-elements/core"
   */
  frameworkImport?: string;

  /**
   * Whether to emit a `waitForReady()` function from API dependencies.
   * Default: true (if apiDependencies exist in the manifest)
   */
  emitWaitForReady?: boolean;

  /**
   * Whether to include `// @generated` markers for diff-safe regeneration.
   * Default: true
   */
  generatedMarkers?: boolean;

  /**
   * Custom label → property name overrides.
   * Keys are manifest labels, values are camelCase property names.
   */
  propertyNameOverrides?: Record<string, string>;

  /**
   * Route name for the generated page function (e.g., "home", "about").
   * If not provided, inferred from the manifest URL path.
   */
  routeName?: string;
}

// ── Multi-route (template detection) ────────────────────────

export interface RouteManifest {
  /** Route identifier (e.g., "home", "about"). */
  route: string;

  /** The crawler manifest for this route. */
  manifest: import("./types.js").CrawlerManifest;
}

/**
 * Shape signature element — used for structural comparison
 * across routes to detect shared templates.
 */
export interface ShapeEntry {
  wrapperType: import("./types.js").WrapperType;
  selectorPattern: string;
}

/**
 * A detected template shared across multiple routes.
 */
export interface DetectedTemplate {
  /** Auto-generated template name (e.g., "storePageTemplate"). */
  name: string;

  /** Routes that share this template's shape. */
  routes: string[];

  /** The shared shape entries. */
  shape: ShapeEntry[];

  /** Labels that vary across routes (become config parameters). */
  varyingLabels: Map<string, Map<string, string>>;

  /** Labels that are identical across all routes. */
  fixedLabels: Map<string, string>;
}

// ── Diff result ─────────────────────────────────────────────

export interface EmitterDiff {
  /** Properties present in generated but missing from existing file. */
  addedProperties: string[];

  /** Properties present in existing file but not in generated output. */
  removedProperties: string[];

  /** Properties with changed selectors or wrapper types. */
  changedProperties: Array<{
    name: string;
    before: string;
    after: string;
  }>;

  /** True if the generated output matches the existing file exactly. */
  unchanged: boolean;
}

// ── Config file ─────────────────────────────────────────────

export interface EmitterConfig {
  /** Custom label → property name mappings. */
  propertyNames?: Record<string, string>;

  /** Custom selector overrides (manifest selector → replacement selector). */
  selectorOverrides?: Record<string, string>;

  /** Framework import path override. */
  frameworkImport?: string;
}
