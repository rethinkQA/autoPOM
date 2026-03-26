# Changelog

All notable changes to `@playwright-elements/crawler` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Initial development release — runtime DOM crawler that discovers semantic groups, generates manifests, emits page objects, and supports human-guided recording for interactive elements.

### Added

- **Group discovery** — automatic detection of semantic element groups in the DOM using ARIA roles, labels, and structural heuristics
- **Manifest generation** — structured JSON manifests describing discovered groups per page, with merge support for incremental updates
- **Shadow DOM support** — crawls through open shadow roots to discover groups inside web components
- **CLI (`pw-crawl`)** — `crawl`, `diff`, `emit`, and `record` subcommands for command-line usage
- **Page Object Emitter** — generates TypeScript page objects from manifests using configurable templates, with diff mode to update existing files
- **Record mode (Phase 14)** — human-guided DOM recording: user interacts in a headed browser while the recorder captures new groups via diff-based discovery and MutationObserver attribution
- **`triggeredBy` attribution** — click action logger and MutationObserver track which user action caused each group to appear
- **Manifest merging** — `mergeManifest()` with additive-only semantics and `promoteVisibility()` for exploration-discovered groups
- **Baseline management** — `save-baselines.ts` script to snapshot manifests, `check-drift.sh` to detect regressions
- **Programmatic API** — `crawlPage()`, `recordPage()`, `emitPageObjects()` exported for use in tests and scripts

### Tests

- 329 integration tests across 7 apps
- 81 unit tests
- 410 total tests, all passing
