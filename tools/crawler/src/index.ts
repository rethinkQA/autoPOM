/**
 * @playwright-elements/crawler — public API.
 *
 * Runtime crawler that discovers groups and containers on a live
 * page and emits a JSON manifest for page object generation.
 */

// ── Core crawling ───────────────────────────────────────────

export { crawlPage, diffPage } from "./crawler.js";

// ── Discovery (low-level) ───────────────────────────────────

export { discoverGroups, discoverToasts, GROUP_SELECTOR } from "./discover.js";

// ── Manifest operations ─────────────────────────────────────

export { mergeManifest, diffManifest } from "./merge.js";

// ── Network observation ─────────────────────────────────────

export { observeNetwork, NetworkObserver } from "./network.js";

// ── Page Object Emitter (Phase 12) ─────────────────────────

export {
  emitPageObject,
  emitMultiRoute,
  emitTemplate,
  computeShape,
  detectTemplates,
} from "./emitter.js";

export { diffPageObjects, formatEmitterDiff } from "./emitter-diff.js";

export { labelToPropertyName, deduplicateNames, inferRouteName } from "./naming.js";

// ── Types ───────────────────────────────────────────────────

export type {
  CrawlerManifest,
  ManifestGroup,
  ManifestDiff,
  CrawlOptions,
  GroupType,
  WrapperType,
  Visibility,
  ApiDependency,
  ApiTiming,
} from "./types.js";

export type {
  EmitOptions,
  RouteManifest,
  ShapeEntry,
  DetectedTemplate,
  EmitterDiff,
  EmitterConfig,
} from "./emitter-types.js";
