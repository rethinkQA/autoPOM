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
export type WrapperType = "group" | "table" | "dialog" | "toast" | "datePicker";

/** Visibility classification of a group. */
export type Visibility = "static" | "dynamic" | "exploration";

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

  /** Description of the user action that triggered this group's appearance (record mode only). */
  triggeredBy?: string;
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

  /** Description of the UI action that triggered this API call (record mode only). */
  triggeredBy?: string;
}

// ── Manifest ────────────────────────────────────────────────

export interface CrawlerManifest {
  /** Schema version for forward-compatible manifest evolution. */
  schemaVersion: number;

  /** The URL path that was crawled (no origin or query params). */
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

  /** Whether to observe network requests (default: true). */
  observeNetwork?: boolean;

  /** AI provider instance for AI-powered discovery (optional). */
  aiProvider?: import("./ai/types.js").AiProvider;
}

// ── Record options ──────────────────────────────────────────

export interface RecordOptions {
  /** Limit recording to elements within this CSS selector. */
  scope?: string;

  /** An existing manifest to merge recorded groups into. */
  existing?: CrawlerManifest | null;

  // Note: network observation is only available via `crawlPage()` (CrawlOptions.observeNetwork).
  // Removed the unused `observeNetwork` field that was declared but never wired up in `recordPage()`.
}

// ── Diff result ─────────────────────────────────────────────

export interface ManifestDiff {
  /** Groups found in the current DOM but not in the manifest. */
  added: ManifestGroup[];

  /** Groups in the manifest but not found in the current DOM. */
  removed: ManifestGroup[];

  /** Groups that exist in both but with updated selectors or attributes. */
  changed: Array<{ mergeKey: string; before: ManifestGroup; after: ManifestGroup }>;

  /** True if the manifest matches the current DOM exactly. */
  unchanged: boolean;
}
