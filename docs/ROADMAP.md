# Implementation Roadmap

> **Ref:** [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)
> **Created:** 2026-02-16
> **Last updated:** 2026-03-20

---

## Completed Phases

All phases below are complete. The full historical checklists are preserved in [docs/archive/ROADMAP-full.md](archive/ROADMAP-full.md).

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project Scaffolding | ✅ Complete |
| 1 | Vanilla HTML Baseline (reference implementation) | ✅ Complete |
| 2 | Vite-Based Apps — React, Vue, Svelte | ✅ Complete |
| 3 | Angular App | ✅ Complete |
| 4 | Next.js SSR App | ✅ Complete |
| 5 | Web Components — Lit App | ✅ Complete |
| 6 | HTMX App | ⏸️ Deferred from v0.1 |
| 7 | Final Validation & Documentation | ✅ Complete |
| 8 | Framework Library (By, handlers, group, typed wrappers) | ✅ Complete |
| 9 | Framework Simplification Sprint (112 issues closed) | ✅ Complete |
| 9.5 | Pre-Phase 10 Prerequisites (SelectAdapter, clickInContainer) | ✅ Complete |
| 10 | Make Apps Idiomatic (component libraries across all 7 apps) | ✅ Complete |
| 10.8 | Post-Review Stabilization (8 P0 fixes, 48 unit tests added) | ✅ Complete |
| 11 | Runtime Crawler (group discovery, manifest, CLI, Shadow DOM) | ✅ Complete |
| 12 | Page Object Emitter (codegen, diff mode, templates, CLI) | ✅ Complete |
| 13 | Validation — Generated vs Hand-Written (structural + functional) | ✅ Complete |
| — | Network Settle Middleware (auto-wait for in-flight HTTP) | ✅ Complete |
| 14 | Crawler Record Mode (DOM Flight Recorder) | ✅ Complete |

**Current test count:** 1,754 tests (1,064 framework integration + 265 unit + 329 crawler integration + 96 crawler unit), all passing.

---

## v0.2 Direction

Candidate goals for the next iteration, roughly prioritized. No target dates — this is a directional guide, not a commitment.

### Product architecture

| Decision | Detail |
|----------|--------|
| **Repo split** | Separate `playwright-elements` (framework runtime) from `autoPOM` (crawler + recorder + AI discovery + emitter). The framework is the published npm package that generated page objects import. autoPOM is the tool that generates those page objects. The fixture apps, shared data, and dev scripts remain in the current repo as the integration test workspace. |
| **autoPOM = crawler + recorder** | The crawl, record, and generate CLI modes are the autoPOM product. They depend on `playwright-elements` at runtime (generated code imports from it). |
| **playwright-elements = runtime framework** | `By`, `group()`, `table()`, `dialog()`, `write()`, `read()`, `click()`, `networkSettleMiddleware()`, handler registry, adapters. Published as an npm package consumers install in their test projects. |

### API traffic capture & validation

| Priority | Goal | Rationale |
|----------|------|-----------|
| 1 | **`captureTraffic()` helper** | Wrap an action, collect all API requests/responses that occur during it, return them for assertion. The `networkSettleMiddleware` already tracks in-flight requests but discards them after settling — this would expose the captured traffic. Enables: payload validation, call count assertions, call order verification, response schema checks. |
| 2 | **`--observe-network` on by default** | Manifest `apiDependencies` should always be populated so generated page objects always include `waitForReady()`. Currently opt-in — most users won't know to enable it. |
| 3 | **Interaction → endpoint attribution** | The crawler already classifies API calls as `"page-load"` vs `"interaction"`. Extend to attribute which UI action triggered which endpoint (e.g., "clicking Save triggers PUT /api/devices/*"). Surfaced in manifest metadata and as comments in generated page objects. |

### Test generation via AI agents

| Priority | Goal | Rationale |
|----------|------|-----------|
| 4 | **Agent-driven test generation** | An AI agent can generate `.spec.ts` test files from the manifest + generated page object. The POM provides the structured API contract (section names, types, selectors). The manifest provides `apiDependencies` and `triggeredBy` metadata. The agent doesn't need to see raw HTML — just the typed page object interface. No scaffold generator needed — the agent generates complete test logic from acceptance criteria + POM. |

### Existing v0.2 candidates

| Priority | Goal | Rationale |
|----------|------|-----------|
| 5 | **Public npm publish** | Remove `"private": true` from `framework/package.json` and `tools/crawler/package.json`. Add `CHANGELOG.md`, publish workflow, and semver tagging. Pre-requisite for external adoption. |
| 6 | **HTMX app** (Phase 6) | Deferred from v0.1. HTMX represents a fundamentally different interaction model (server-driven HTML swaps) that the framework hasn't been validated against. See REQUIREMENTS.md §5 and §9. |
| 7 | **API mocking targets** | Apps that consume a mock REST/GraphQL backend (MSW or similar). Validates the `networkSettleMiddleware` against real async data flows instead of `setTimeout` simulations. See REQUIREMENTS.md §9. |
| 8 | **Cross-browser CI stabilization** | The weekly Firefox/WebKit CI job (P2-39) is in place but may surface failures. Stabilizing cross-browser support strengthens the framework's core thesis of cross-technology compatibility. |
| 9 | **Authentication UI patterns** | Login forms, protected routes, session management. A common real-world pattern that the framework doesn't currently exercise. See REQUIREMENTS.md §9. |

### Decision criteria

An item moves from "candidate" to "active" when:
- It has a clear owner or contributor willing to drive it
- It doesn't destabilize the existing 1,754-test safety net
- It addresses a gap that blocks adoption or reduces framework credibility

---

## Next — Open Work Items

See [ISSUES.md](ISSUES.md) for current project status and tracked issues.

---

## Phase 14 — Crawler Record Mode (DOM Flight Recorder)

> **Status:** ✅ Complete
> **Decided:** 2026-03-19
> **Completed:** 2026-03-19
> **Prerequisite:** ~~P2-27 (stabilize manifest merge key)~~ — DONE

Human-guided recording mode for the crawler. The user runs `npx pw-crawl record <url>`, interacts with the app in a headed browser, and the tool captures every DOM group that materializes during the session via a diff-based discovery approach (snapshots initial DOM, re-discovers after interaction, diffs to find new groups). An injected MutationObserver + click action logger provides `triggeredBy` attribution. Output merges into existing manifests via `mergeManifest()` — additive-only.

Resolves the remaining `[P1-13]` skipped tests by capturing dialogs and toasts that only exist after user interaction (4 were previously resolved by P1-20 exact-first label resolution). Generalizes to production apps where ARIA coverage is incomplete and automated heuristics would fail.

**New files:**
- `tools/crawler/src/recorder.ts` — `DomRecorder` class (diff-based harvest, MutationObserver for triggeredBy attribution)
- `tools/crawler/src/record-api.ts` — `recordPage(page, interact, options?)` convenience API

**Implementation checklist:**

- [x] Fix P2-27 — stabilize manifest merge key (prerequisite)
- [x] `ManifestGroup` type: add optional `triggeredBy` field, `"exploration"` visibility value
- [x] Observer init script: MutationObserver watching `GROUP_SELECTOR` matches
- [x] Action logger: intercept page events, log with timestamps for `triggeredBy` attribution
- [x] Harvest function: diff-based approach — snapshot initial groups, re-discover after interaction, diff to find new groups
- [x] CLI `record` subcommand in `pw-crawl.ts`
- [x] Programmatic API: `recordPage(page, interact, options?)` in `src/index.ts`
- [x] Merge integration: `mergeManifest()` handles `"exploration"` visibility with `promoteVisibility()`
- [x] Run `record` on all 7 apps, verify dialogs/toasts captured
- [x] Un-skip `[P1-13]` tests — 14 tests un-skipped across 4 test files using recorder for non-vanilla apps
- [x] Update crawler README with `record` CLI docs
- [x] Update test counts in docs

---

## Future — Automated Exploration (Optional Layer)

The [archived proposal](archive/PROPOSAL-crawler-exploration.md) evaluated three automated exploration strategies (MutationObserver + heuristic triggers, ARIA-frontier + page-reload, contract verification). These were rejected for Phase 14 in favor of human-guided recording, but may be revisited as an optional `--auto-explore` flag layered on top of the recording foundation.

---

## Tips

- **Use the vanilla-html app as your behavioral reference.** When in doubt about how a contract element should *behave*, check the vanilla baseline. Don't copy its DOM — the point is different DOM, same behavior.
- **The behavioral contract is the only shared contract.** Outcomes (filter results, sort order, toast text) must match across apps. DOM structure, tag names, and CSS classes will not match — and that's the point.
- **The crawler finds groups, the framework finds elements.** Don't try to classify individual controls in the crawler — `group.write()` handles that at runtime.
- **The existing 1,716 tests are your safety net.** After every change, run the integration tests. If they break, the framework needs a new handler/detect rule — that's the feedback loop.
- **Commit after each phase.** Each phase is a stable checkpoint.

---

*This roadmap is a companion to [REQUIREMENTS.md](../docs/REQUIREMENTS.md). Update both as decisions are made.*
