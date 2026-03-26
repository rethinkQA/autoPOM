# Review Synthesis Report — @playwright-elements/core

> ## ⚠️ SUPERSEDED — DO NOT USE FOR CURRENT PROJECT STATUS
>
> **This report is a historical snapshot from 2026-03-15 (post-Phase 10, pre-Phase 10.8).** The scores, priority matrix, and risk assessment below **do not reflect the current project state.** All issues identified in this review have been resolved. Significant work has been completed since:
>
> - **All 8 P0 issues** resolved in Phase 10.8 (Post-Review Stabilization)
> - **Phases 11–13** completed: runtime crawler, emitter, validation suite
> - **`networkSettleMiddleware`** added for API-aware test stability
> - **`editableSelectAdapter`** extracted; `comboboxSet` refactored into thin dispatcher
> - **48+ new unit tests** added (element classifier, label resolution, select adapter, etc.)
> - **Complete Phase 10 cross-app migration** — all 7 apps validated
> - **149 architecture issues tracked and resolved** (see [`ARCHITECTURE_ISSUES.md`](ARCHITECTURE_ISSUES.md))
>
> **For current project status, see:**
> - [`docs/ISSUES.md`](../ISSUES.md) — live issue tracker (replaces this report)
> - [`framework/README.md`](../../framework/README.md) — compatibility matrix, test counts, API docs
> - [`docs/ROADMAP.md`](../ROADMAP.md) — phase summary and open work items
>
> Current test count: see [`docs/ROADMAP.md`](../ROADMAP.md) for live numbers. See [`docs/ISSUES.md`](../ISSUES.md) for live status.

---

> **Author:** Engineering Lead  
> **Date:** 2026-03-15  
> **Scope:** Post-Phase 10 review synthesis from 4 independent reviewers  
> **Codebase:** ~10,500 LoC across 49 source files; 15 unit test files (~2,700 LoC); 14 integration spec files across 7 app targets

> **⚠️ Status: Pre-10.8 snapshot.** All 8 P0 issues identified below have been resolved:
> - P0-1: `expect` removed from production code (10.8.1)
> - P0-2: Cross-layer dependency fixed — `genericNonEditableSelectAdapter` moved to `adapters/` (10.8.2)
> - P0-3: Element classifier now has 21 dedicated unit tests (10.8.4)
> - P0-4: Label resolution now has 27 dedicated unit tests (10.8.5)
> - P0-5/P0-6/P0-7: Documentation method names, test counts, and dead references fixed (10.8.6)
> - P0-8: All 9 empty `catch {}` blocks replaced with targeted `isRetryableInteractionError()` rethrow (10.8.3)
> - Magic timeouts extracted to named constants in `src/timeouts.ts` (10.8.7)

---

## EXECUTIVE SUMMARY

The framework has strong foundational architecture: interface-first dependency injection, AsyncLocalStorage context isolation, a versioned/frozen handler registry, structured error types, and a three-tier export surface (`core`, `core/extend`, `core/internals`). These are genuinely well-executed and above average for a project of this age. The 700-test cross-framework validation suite proves the label-first abstraction works across 7 renderers — a non-trivial achievement.

However, four independent reviews converge on the same structural risk: **the framework has two parallel interaction systems that don't compose**. The handler registry (`write(label, value)` auto-detection path) and the typed element wrappers (`checkbox().check()`, `select().write()`) share terminology and handler names but execute through completely different code paths. The select/combobox story is the worst manifestation — three overlapping implementations (`comboboxSet`, `SelectAdapter` interface, `genericNonEditableSelectAdapter`) with no unified contract. This fragmentation makes bugs expensive to fix and the framework harder to extend. Combined with ~60% of source lines having no dedicated unit tests (particularly the classification and label-resolution engines), there is significant hidden risk beneath the passing integration suite.

Documentation is the weakest dimension. Method names are wrong in two major docs, deleted APIs are still referenced, ~~the README claims "zero library-specific code paths" despite 4+ adapter implementations~~ (corrected: docs now state library-specific logic is isolated in adapters), and there is no getting-started guide for new consumers. This will become a blocking problem the moment an external team tries to adopt the framework.

---

## SCORECARD

| Dimension | Score | Critical Issues | Key Concern |
|---|---|---|---|
| **Code Quality** | 6.5 / 10 | 3 | Empty catches, magic timeouts, O(N) hot paths |
| **Architecture** | 5.5 / 10 | 3 | Dual interaction systems, select fragmentation, layer violations |
| **Test Quality** | 5.5 / 10 | 4 | Classifier + label-resolution untested, ~60% code uncovered by unit tests |
| **Documentation** | 4.0 / 10 | 5 | Wrong method names, deleted APIs, misleading claims |
| **Overall** | **5.4 / 10** | **15** | Solid plumbing, fragile porcelain, misleading docs |

---

## PRIORITY MATRIX

### P0 — Fix Before Phase 11

These issues will compound during runtime crawler work or are actively incorrect now.

| # | Issue | Source |
|---|-------|--------|
| P0-1 | **select-adapter.ts imports `expect` from `@playwright/test`** — breaks the "no test-runner dependency" invariant; runtime crawler will inherit this coupling | Arch-C3 |
| P0-2 | **Cross-layer dependency: default-handlers.ts → elements/select-adapter.ts** — handler layer imports from element layer, inverting dependency direction | Arch-C1 |
| P0-3 | **Element classifier has ZERO unit tests** — Phase 11 crawler will heavily exercise classification; regressions will be invisible | Test-C1 |
| P0-4 | **Label resolution engine (270 lines) has ZERO unit tests** — most-exercised code path, most complex logic, no safety net | Test-C2 |
| P0-5 | **Method names wrong in REQUIREMENTS.md and root README** — `set()`/`get()` instead of `write()`/`read()` across 15+ occurrences; new contributors will write wrong code | Doc-C1 |
| P0-6 | **Root README claims "871 tests", references deleted `pageElements()`, wrong phase status** — actively misleading for anyone evaluating the project | Doc-C2 |
| P0-7 | **`FRAMEWORK_DESIGN.md` referenced but doesn't exist** — broken doc link | Doc-C3 |
| P0-8 | **9 empty `catch {}` blocks** in select-adapter (6), checkbox (2), default-handlers (1) — suppress all error diagnostics in the most complex interaction paths | Code-H1 |

### P1 — Fix During Phase 11

Can be addressed alongside Phase 11 work without dedicated time boxing.

| # | Issue | Source |
|---|-------|--------|
| P1-1 | **Two competing combobox/select systems** with no unified contract — 3 places to fix every select bug | Arch-C2 |
| P1-2 | **Typed wrappers bypass handler registry entirely** — `registerHandler("checkbox")` has no effect on `checkbox().check()` | Arch-H1 |
| P1-3 | **Adapter pattern inconsistently applied** — DatePicker has it, checkbox/radio/dialog/stepper embed library-specific logic inline | Arch-H2 |
| P1-4 | **Unsafe `as Promise<T>` cast in middleware pipeline** erases type safety | Code-C1 |
| P1-5 | **`comboboxSet` page-level option search** can match wrong combobox when multiple are open | Code-C3 |
| P1-6 | **`scanRowsLocator` O(rows × criteria)** sequential browser round-trips — Phase 11 table crawling will amplify this | Code-H3 |
| P1-7 | **`playwright-errors.ts` untested** — Playwright message format change = silent breakage in retry logic | Test-H1 |
| P1-8 | **`cssEscape` polyfill (70 lines) has zero tests** | Test-H4 |
| P1-9 | **`toggleSet`/`checkbox.check()` hardcoded 2000ms magic timeout**, duplicated in 4 places | Code-H2 |
| P1-10 | **`_mutationWarned` global Set leaks across tests** | Code-H6 |
| P1-11 | **Date picker read assertions are `toBeTruthy()` for 5/7 apps** — adapter could return garbage and pass | Test-C4 |
| P1-12 | **Override-escape tests silently skip primary code paths** — wrappers tested on 2-3 apps, not 7 | Test-C3 |
| P1-13 | **No error-path tests for handler failures** (comboboxSet throw, radiogroupSet throw) | Test-H2 |
| P1-14 | **Group decomposition is cosmetic** — 6 files share one `GroupMethodDeps` god-object | Arch-H3 |
| P1-15 | **`normalizeRadioLabel` silently truncates labels with em/en dashes** — may break on legitimate labels | Code-H5 |
| P1-16 | **SelectAdapter injection undocumented** in framework README | Doc-M1 |
| P1-17 | **No adapter wiring docs** (app-config.ts pattern) | Doc-M2 |
| ~~P1-18~~ | ~~**ui-contract.md contradicts REQUIREMENTS.md**~~ — RESOLVED: file deleted, REQUIREMENTS.md §6 updated | ~~Doc-S1~~ |

### P2 — Fix After Phase 11

Important but not blocking; technical debt that should be scheduled.

| # | Issue | Source |
|---|-------|--------|
| P2-1 | **`resolveOnce` fires 10 concurrent browser queries** per label resolution — correct but expensive | Code-H4 |
| P2-2 | **Dead `count` variable in `checkboxgroupGet`** — redundant browser round-trip | Code-C2 |
| P2-3 | **15-iteration retry loop** in select-adapter disconnected from caller timeout | Code-M |
| P2-4 | **`comboboxSet` is a 120-line monolith** — should be decomposed | Code-M |
| P2-5 | **Duplicated tag/role detection** across handlers | Code-M |
| P2-6 | **`By.any()` silently returns `.first()`** — can hide ambiguity bugs | Code-M |
| P2-7 | **ROLE_PRIORITY requires manual sync** with handler registry | Code-M |
| P2-8 | **`clickInContainer` unit tests cover 2/7 role cascade steps** | Test-H3 |
| P2-9 | **`validateValueType`/`validateReturnedValue` have zero unit tests** | Test-H5 |
| P2-10 | **Group batch resolution cache untested** | Test-H6 |
| P2-11 | **No getting-started guide** for new projects | Doc-M3 |
| P2-12 | **No troubleshooting/FAQ** section | Doc-M4 |
| P2-13 | ~~**"Zero library-specific code paths" claim is false**~~ — corrected in ROADMAP, REQUIREMENTS §8, and framework README | Doc-M5 |
| P2-14 | **PLAN.md vs README unit test count mismatch** (161 vs 171) | Doc-S2 |
| P2-15 | **Sequential `clickInContainer` role cascade** | Code-M |
| P2-16 | **Dynamic imports in `nativeSelectAdapter.read()`** — unnecessary runtime overhead | Code-M |

---

## TOP 10 ACTIONS

| # | Action | Why | Effort | Addresses |
|---|--------|-----|--------|-----------|
| 1 | **Add unit tests for `classifyElement` and `resolveLabeled`/`resolveOnce`** — mock handlers and locators, test each detection phase separately | These two modules (~450 lines) are the framework's most critical code paths. Phase 11 crawler will stress them heavily. Zero unit tests means any refactoring is blind. | 6–8 hrs | Test-C1, Test-C2 |
| 2 | **Remove `expect` import from `select-adapter.ts`; replace `expect(...).toHaveAttribute()` with `locator.getAttribute()` polling** | Breaks the architectural invariant that the framework has no test-runner dependency. 1-line import, 2 callsites. | 1 hr | Arch-C3 |
| 3 | **Replace all 9 empty `catch {}` blocks with `catch (e) { logger.debug(...) }` or re-throw with context** | Swallowed errors in the select/checkbox interaction paths make debugging cross-library failures nearly impossible. | 2 hrs | Code-H1 |
| 4 | **Fix method names in REQUIREMENTS.md and root README** — bulk find-replace `set(`→`write(`, `get(`→`read(`; remove `pageElements()` references; update test count and phase status | Prevents every new reader from writing incorrect code. Pure text edits. | 2 hrs | Doc-C1, Doc-C2, Doc-C3 |
| 5 | **Extract magic timeouts (2000ms check, 3000ms click, 150ms poll) into named constants or config** — single source of truth | Hardcoded timeouts appear in 4+ places; changing one without the others creates subtle inconsistencies. | 1.5 hrs | Code-H2, Code-H3 |
| 6 | **Unify select interaction: promote `SelectAdapter` to the sole select/combobox abstraction** — `comboboxSet`'s inline logic becomes `editableSelectAdapter`; `genericNonEditableSelectAdapter` stays; both implement `SelectAdapter` | Eliminates the 3-place bug-fix problem. The DatePicker adapter pattern already proves this works. | 8–12 hrs | Arch-C2, Arch-H2, Code-C3 |
| 7 | **Invert the dependency: move `genericNonEditableSelectAdapter` to `default-handlers.ts` or a shared `adapters/` folder** that both layers can import | Fixes the layer violation where the handler layer imports from the element layer. | 2 hrs | Arch-C1 |
| 8 | **Add unit tests for `playwright-errors.ts` and `cssEscape`** — verify pattern matching against actual Playwright error messages and known CSS escape edge cases | These are brittle string-matching utilities with zero coverage; Playwright version bumps will silently break them. | 3 hrs | Test-H1, Test-H4 |
| 9 | **Replace `toBeTruthy()` date picker assertions with exact-value checks** for all 7 apps | Current assertions prove the adapter *runs* but not that it returns correct data. | 2 hrs | Test-C4 |
| 10 | **Add scoped listbox resolution to `comboboxSet` page-level fallback** — when multiple comboboxes exist, filter options by the dropdown associated with `aria-controls`/`aria-owns` before falling back to page search | Prevents wrong-combobox selection in multi-combobox forms, which Phase 11 forms will likely create. | 3 hrs | Code-C3 |

**Total estimated effort for all 10 actions: ~30–36 hours (4–5 focused days)**

---

## RISK ASSESSMENT

### If Phase 11 proceeds with zero fixes:

1. **Runtime crawler will magnify the O(N) scan problem (P1-6).** The crawler will exercise `scanRowsLocator` on dynamically discovered tables. Sequential per-row, per-criteria browser round-trips will make crawl times unacceptable for large pages, forcing a rewrite under pressure.

2. **Classifier regressions will be invisible (P0-3, P0-4).** Phase 11 will necessarily modify or extend element classification to handle dynamically discovered elements. With zero unit tests on the classifier and label-resolution engine, regressions will only surface as flaky integration tests across 7 apps — expensive to diagnose.

3. **`expect` import in production code (P0-1) will propagate.** The crawler is a runtime feature. If it inherits the `@playwright/test` dependency through `select-adapter.ts`, the framework can never be used outside Playwright's test runner (e.g., in a standalone crawl CLI).

4. **Select fragmentation will triple (P1-1).** The crawler will discover new select/combobox variants across component libraries. Without a unified `SelectAdapter` contract, each new variant adds code to 3 places instead of 1, accelerating technical debt.

5. **Documentation gap blocks adoption (P0-5, P0-6).** If Phase 11 produces a usable crawler, external teams will evaluate the framework. They will immediately encounter wrong method names and deleted API references, undermining credibility.

### Minimum viable fix set before Phase 11:

Address P0-1 through P0-4 (architectural invariant, layer violation, unit tests for classifier + label-resolution) and P0-5 through P0-7 (documentation corrections). This is approximately **12–14 hours of work** and eliminates the highest-compounding risks.
