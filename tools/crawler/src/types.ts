/**
 * Manifest types — the single output artifact of the crawler.
 *
 * A manifest describes the groups and special wrappers discovered
 * on a single page URL. Manifests are append-only across passes:
 * new groups are added, existing groups are updated, and groups
 * not found in the current DOM are kept with a `lastSeen` timestamp.
 */

// ── Group types ─────────────────────────────────────────────

/** The semantic type of a discovered group. */
export type GroupType =
  | "nav"
  | "header"
  | "footer"
  | "main"
  | "aside"
  | "section"
  | "fieldset"
  | "form"
  | "region"
  | "toolbar"
  | "tablist"
  | "menu"
  | "menubar"
  | "details"
  | "generic";

/** The wrapper type for special elements that need typed factories. */
export type WrapperType = "group" | "table" | "dialog" | "toast";

/** Visibility classification of a group. */
export type Visibility = "static" | "dynamic";

// ── Discovered group entry ──────────────────────────────────

export interface ManifestGroup {
  /** Human-readable label extracted from the DOM (aria-label, legend, heading, etc.) */
  label: string;

  /** CSS selector or role-based locator descriptor that uniquely identifies this group. */
  selector: string;

  /** Semantic type of the group (nav, fieldset, region, etc.) */
  groupType: GroupType;

  /** Wrapper type for code generation (group, table, dialog, toast). */
  wrapperType: WrapperType;

  /** Which crawler pass discovered this group. */
  discoveredIn: string;

  /** Whether the element was visible when discovered. */
  visibility: Visibility;

  /** ISO timestamp of when this group was last seen in the DOM. */
  lastSeen: string;

  /** Optional notes (e.g., "needs-adapter" for date pickers). */
  notes?: string;
}

// ── API dependency ──────────────────────────────────────────

export type ApiTiming = "page-load" | "interaction";

export interface ApiDependency {
  /** URL pattern of the intercepted request. */
  pattern: string;

  /** HTTP method. */
  method: string;

  /** When the request fires relative to navigation. */
  timing: ApiTiming;
}

// ── Manifest ────────────────────────────────────────────────

export interface CrawlerManifest {
  /** Schema version for forward-compatible manifest evolution. */
  schemaVersion: number;

  /** The URL that was crawled. */
  url: string;

  /** ISO timestamp of the latest crawl. */
  timestamp: string;

  /** The scope selector used to limit the crawl (null = full page). */
  scope: string | null;

  /** Total number of passes that contributed to this manifest. */
  passCount: number;

  /** All discovered groups. */
  groups: ManifestGroup[];

  /** Optional API dependencies observed during crawl. */
  apiDependencies?: ApiDependency[];
}

// ── Crawler options ─────────────────────────────────────────

export interface CrawlOptions {
  /** Limit crawl to elements within this CSS selector. */
  scope?: string;

  /** Pass number for append-only merge (default: 1). */
  pass?: number;

  /** Whether to observe network requests (default: false). */
  observeNetwork?: boolean;
}

// ── Diff result ─────────────────────────────────────────────

export interface ManifestDiff {
  /** Groups found in the current DOM but not in the manifest. */
  added: ManifestGroup[];

  /** Groups in the manifest but not found in the current DOM. */
  removed: ManifestGroup[];

  /** Groups that exist in both but with updated labels or attributes. */
  changed: Array<{ selector: string; before: ManifestGroup; after: ManifestGroup }>;

  /** True if the manifest matches the current DOM exactly. */
  unchanged: boolean;
}
