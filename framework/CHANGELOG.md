# Changelog

All notable changes to `@playwright-elements/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — Unreleased

Initial development release — semantic-selector framework for Playwright with built-in retry, middleware pipeline, and adapter-based element handling.

### Added

- **By selectors** — `By.role()`, `By.label()`, `By.text()`, `By.css()`, `By.shadow()`, `By.within()`, `By.any()`, `By.first()` for semantic element selection
- **Handler registry** — pluggable per-element-type handlers (`ButtonHandler`, `InputHandler`, `SelectHandler`, `CheckboxHandler`, etc.) with a classification pipeline
- **Retry engine** — configurable retry with exponential backoff for flaky locator resolution
- **Middleware pipeline** — composable `before`/`after` middleware hooks for cross-cutting concerns (logging, assertions, custom waits)
- **Network settle middleware** — auto-waits for in-flight HTTP requests to complete before proceeding, eliminating manual `waitForResponse` calls
- **Adapter system** — `SelectAdapter` and `ClickInContainerAdapter` for framework-specific element behaviors
- **Element wrappers** — typed factories: `group()`, `button()`, `checkbox()`, `radio()`, `text()`, `stepper()`, `dialog()`, `table()`, `datePicker()` with action methods (`set()`, `read()`, `click()`, `choose()`, `options()`, `close()`, `title()`, `body()`, `findRow()`, `sort()`, `rows()`, `rowCount()`, `isEmpty()`, `emptyText()`, `increment()`, `decrement()`, `isMinDisabled()`, `isMaxDisabled()`, etc.) — wrapped via `wrapElement()` for middleware pipeline integration
- **Label resolution** — multi-strategy label matching: `aria-label`, associated `<label>`, `placeholder`, visible text, with exact-first priority
- **DOM helpers** — `getActiveContext()` for modal/dialog detection, `isAttached()`, `isStable()`, scroll helpers
- **Playwright test fixture** — `test.extend()` integration via `createFixture()` for seamless test authoring
- **Configurable timeouts** — `ACTION_TIMEOUT`, `RETRY_TIMEOUT`, `RETRY_INTERVAL` constants
- **Logger configuration** — structured logging with configurable verbosity

### Changed

- Simplified handler API from 40+ element types down to a focused set of behavioral handlers (Phase 9 — 112 issues closed)
- Exact-first label resolution (P1-20) — labels now prefer exact matches before substring, fixing false-positive locator hits

### Fixed

- 8 P0 critical fixes during post-review stabilization (Phase 10.8)
- 48 unit tests added to cover edge cases discovered during stabilization
- Console error dedup for `getActiveContext()` polling

### Tests

- 1,043 integration tests across 7 apps (vanilla-html, react, vue, angular, svelte, nextjs, lit)
- 263 unit tests
- 1,306 total tests, all passing (framework-only; see ROADMAP.md for full count)
