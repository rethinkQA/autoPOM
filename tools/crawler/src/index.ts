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

export { mergeManifest, diffManifest, mergeKey } from "./merge.js";

// ── Network observation ─────────────────────────────────────

export { observeNetwork, NetworkObserver } from "./network.js";

// ── DOM Flight Recorder (Phase 14) ─────────────────────────

export { DomRecorder } from "./recorder.js";
export type { PageRecording } from "./recorder.js";
export { recordPage } from "./record-api.js";

// ── Page Object Emitter (Phase 12) ─────────────────────────

export {
  emitPageObject,
  emitMultiRoute,
  emitTemplate,
  computeShape,
  detectTemplates,
} from "./emitter.js";

export { diffPageObjects, formatEmitterDiff } from "./emitter-diff.js";

export { labelToPropertyName, deduplicateNames, inferRouteName, safePathname } from "./naming.js";

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
  RecordOptions,
} from "./types.js";

export type {
  EmitOptions,
  RouteManifest,
  ShapeEntry,
  DetectedTemplate,
  EmitterDiff,
  EmitterConfig,
} from "./emitter-types.js";
