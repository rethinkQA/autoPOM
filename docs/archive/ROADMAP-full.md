# Implementation Roadmap

> **Ref:** [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)
> **Created:** 2026-02-16
> **Last updated:** 2026-03-18

---

## Completed Phases

All phases below are complete. The full historical checklists are preserved in [docs/archive/ROADMAP-full.md](archive/ROADMAP-full.md) if needed.

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
| 9 | Framework Simplification Sprint | ✅ Complete |
| 9.5 | Pre-Phase 10 Prerequisites | ✅ Complete |
| 10 | Make Apps Idiomatic (component libraries) | ✅ Complete |
| 10.8 | Post-Review Stabilization (P0 fixes) | ✅ Complete |
| 11 | Runtime Crawler | ✅ Complete |
| 12 | Page Object Emitter | ✅ Complete |
| 13 | Validation — Generated vs Hand-Written | ✅ Complete |
| — | Network Settle Middleware | ✅ Complete |

**Current test count:** 2,088 tests (924 integration across 7 apps + 219 unit + 868 crawler integration + 77 crawler unit), all passing.

---

## Open Phases

> Build the simplest possible app first. This becomes the **reference implementation** that all other apps are measured against. Uses plain JavaScript (no TypeScript) — this app is intentionally zero-tooling.

- [x] Create `apps/vanilla-html/`
- [x] Build a single `index.html` + `style.css` + `app.js` (no build tools, no npm dependencies beyond a static server)
- [x] Implement the **GeneralStore** theme (§6.0): Home page with product catalog, About page with store description
- [x] Implement every element from the UI contract (§6.1–6.4):
  - Header with store name + technology identifier, nav (Home / About), main content area, footer
  - About page with store description (`data-testid="about-text"`)
  - Data table: product catalog with Name, Price, Category, Stock columns (`data-testid="data-table"`)
  - Table sorting by column header click (`data-testid="table-sort"`)
  - Text input for product search/filter → filters table rows in real time (`data-testid="text-input"`, `data-testid="table-filter"`)
  - Dropdown: product category filter with 3+ options (`data-testid="select-dropdown"`)
  - Checkbox: "Show only in-stock items" toggle (`data-testid="toggle-checkbox"`)
  - Quantity stepper with +/− controls (`data-testid="quantity-input"`)
  - Button: "Add to Cart" → output display shows confirmation (`data-testid="action-button"`, `data-testid="action-output"`)
  - Radio group: shipping method (Standard / Express / Overnight) with displayed cost (`data-testid="radio-group"`)
  - Date picker: delivery date using native `<input type="date">` (`data-testid="date-picker"`)
  - Modal/Dialog: product detail or confirmation dialog (`data-testid="modal-dialog"`)
  - Toast/Notification: "Added to cart" auto-dismiss after ~3s (`data-testid="toast-notification"`)
  - Static list of 3+ items (`data-testid="item-list"`)
  - Delayed content via `setTimeout` (1–2s) — e.g., "Loading recommendations…" (`data-testid="delayed-content"`)
  - Form validation message on empty search submit (`data-testid="validation-message"`)
  - Hash-based routing (`#home`, `#about`)
- [x] Add all `data-testid` attributes exactly as specified in §6
- [x] Add semantic HTML + labels + ARIA (§6.4)
- [x] Add a `package.json` with a `start` script using a simple static server: `npx serve -l 3001`
- [x] Verify: `npm start` → opens on `http://localhost:3001`
- [x] Create `apps/vanilla-html/README.md`
- [x] **Snapshot this as the golden reference** — screenshot or manual walkthrough of every testable element

---

## Phase 2: Vite-Based Apps — React, Vue, Svelte _(~3–4 hours)_

> These three share the same build tool (Vite), so they'll follow a similar pattern. Build them in parallel or sequentially.

### React App
- [x] Scaffold: `npm create vite@latest react-app -- --template react-ts` inside `apps/`
- [x] Strip out boilerplate, implement GeneralStore UI contract (§6)
- [x] Use `react-router-dom` for routing (Home / About views)
- [x] Configure Vite dev server to port `3002`
- [x] Set `start` script in `package.json` → `vite --port 3002`
- [x] Verify: `npm start` → opens on `http://localhost:3002`, all contract elements present
- [x] Create `apps/react-app/README.md`

### Vue App
- [x] Scaffold: `npm create vite@latest vue-app -- --template vue-ts` inside `apps/`
- [x] Strip boilerplate, implement GeneralStore UI contract (§6)
- [x] Use `vue-router` for routing
- [x] Configure port `3003`
- [x] Set `start` script → `vite --port 3003`
- [x] Verify: `npm start` → opens on `http://localhost:3003`, all contract elements present
- [x] Create `apps/vue-app/README.md`

### Svelte App
- [x] Scaffold: `npm create vite@latest svelte-app -- --template svelte-ts` inside `apps/`
- [x] Strip boilerplate, implement GeneralStore UI contract (§6)
- [x] Use hash-based or simple conditional routing (or `svelte-routing`)
- [x] Configure port `3005`
- [x] Set `start` script → `vite --port 3005`
- [x] Verify: `npm start` → opens on `http://localhost:3005`, all contract elements present
- [x] Create `apps/svelte-app/README.md`

---

## Phase 3: Angular App _(~2–3 hours)_

> Angular has its own CLI and build system — treat it separately.

- [x] Scaffold: `npx @angular/cli new angular-app --minimal --standalone --skip-git` inside `apps/`
- [x] Strip boilerplate, implement GeneralStore UI contract (§6) using standalone components
- [x] Use Angular Router for navigation (Home / About)
- [x] Set port to `3004` in `angular.json` (`serve.options.port`)
- [x] Set `start` script → `ng serve --port 3004`
- [x] Verify: `npm start` → opens on `http://localhost:3004`, all contract elements present
- [x] Create `apps/angular-app/README.md`

---

## Phase 4: Next.js SSR App _(~2–3 hours)_

> Next.js in SSR dev mode — exercises real server-side rendering and hydration. `next dev` is a dev server (same category as Vite), not a production backend. No API routes, no database — satisfies G4.

- [x] Scaffold: `npx create-next-app@latest nextjs-app --typescript` inside `apps/`
- [x] **Do not** set `output: 'export'` — run in SSR dev mode to get real hydration behavior
- [x] Implement GeneralStore UI contract (§6) using App Router (`app/` directory)
- [x] Use Next.js `<Link>` for routing between Home / About pages
- [x] Set dev server to port `3006` in `package.json` start script: `next dev -p 3006`
- [x] Verify: `npm start` → opens on `http://localhost:3006`, all contract elements present
- [x] Note any hydration-specific caveats in the app's README
- [x] Create `apps/nextjs-app/README.md`

---

## Phase 5: Web Components — Lit App _(~2–3 hours)_

> This is the **Shadow DOM stress test** — critical for framework selector strategy validation.

- [x] Scaffold a Lit project in `apps/lit-app/` (Vite + Lit starter or manual setup, TypeScript)
- [x] Implement GeneralStore UI contract (§6) as Lit custom elements
- [x] **Shadow DOM `data-testid` placement — follow §6.5 of REQUIREMENTS.md (resolved):**
  - Place `data-testid` on the **custom element host** (light DOM) for page-level structural elements: `app-header`, `nav-home`, `nav-about`, `about-text`, `main-content`, `app-footer`
  - Place `data-testid` **inside the shadow root** for interactive elements: `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `data-table`, `table-sort`, `table-filter`, `date-picker`, `quantity-input`, `modal-dialog`, `toast-notification`, `item-list`, `delayed-content`, `validation-message`
  - This dual placement tests both standard and shadow DOM piercing selectors
- [x] Use hash-based routing or simple conditional rendering for navigation
- [x] Configure port `3007`
- [x] Verify: `npm start` → opens on `http://localhost:3007`, all contract elements present
- [x] Create `apps/lit-app/README.md` with shadow DOM notes

---

## Phase 6: HTMX App — DEFERRED

> **Status:** Deferred from v0.1. The existing 7 apps provide sufficient technology diversity to validate the framework. HTMX can be added in a future version if the framework team wants to validate non-SPA, hypermedia-driven DOM updates.

- [ ] ~~Create `apps/htmx-app/`~~ — deferred to v0.2+

---

## Phase 7: Final Validation & Documentation _(~1–2 hours)_

> Run everything together and lock it down.

- [x] Run `npm run start:all` from root — verify all 7 apps start on their assigned ports
- [x] Manually verify each app in the browser: all GeneralStore UI contract elements present and functional
- [x] Capture results in a compatibility matrix:
  ```
  | App            | Port | Status | Notes          |
  |----------------|------|--------|----------------|
  | vanilla-html   | 3001 | ✅     | Reference — all contract elements pass |
  | react-app      | 3002 | ✅     | react-datepicker; modal/toast use native/custom |
  | vue-app        | 3003 | ✅     | vue-datepicker; modal/toast use native/custom |
  | angular-app    | 3004 | ✅     | Angular Material mat-datepicker, MatSnackBar, MatDialog |
  | svelte-app     | 3005 | ✅     | flatpickr; custom toast |
  | nextjs-app     | 3006 | ✅     | react-datepicker, react-hot-toast |
  | lit-app        | 3007 | ✅     | All native — Shadow DOM stress test |
  ```
- [x] Update root `README.md` with final status and instructions
- [x] ~~Update `shared/ui-contract.md`~~ — file consolidated into REQUIREMENTS.md §6 and deleted
- [x] Tag the repo as `v0.1.0`

---

## Suggested Build Order (Summary)

| Order | Phase | App(s) | Why This Order |
|-------|-------|--------|---------------|
| 1 | Phase 0 | — | Scaffolding first, always |
| 2 | Phase 1 | `vanilla-html` | Reference implementation — no framework noise |
| 3 | Phase 2 | `react-app` | Most common target, validates contract against a real SPA |
| 4 | Phase 2 | `vue-app`, `svelte-app` | Similar Vite pattern, fast to build after React |
| 5 | Phase 3 | `angular-app` | Different build system, good mid-point milestone |
| 6 | Phase 4 | `nextjs-app` | SSR + hydration edge cases |
| 7 | Phase 5 | `lit-app` | Shadow DOM — hardest selector challenges, do it late when contract is stable |
| 8 | Phase 7 | — | Final validation pass (all apps native HTML) |
| 9 | Phase 8 | Framework library | Build the typed element interaction library, validate against vanilla-html |
| 10 | Phase 9 | Framework simplification | Eliminate 112 architecture issues before expanding test surface |
| 11 | Phase 8.5 | Framework cross-app | Run framework tests against all 7 apps, build adapters for date pickers / dialogs |
| 11.5 | **Phase 9.5** | **Framework pre-work** | **Create SelectAdapter, fix comboboxSet, expand clickInContainer — blocks Phase 10** |
| 12 | **Phase 10** ✅ | **All 6 non-vanilla apps** | **Complete: all apps use idiomatic component libraries, 700/700 tests passing** |
| 12.5 | **Phase 10.8** | **Framework stabilization** | **Fix P0 issues from 4-agent review: remove `expect` import, fix layer violation, add classifier/label-resolution unit tests, replace empty catches, fix stale docs** |
| 13 | **Phase 11** ✅ | **Runtime Crawler** | **Complete: discovers groups/containers across all 7 apps, append-only merge, CI diff, Shadow DOM piercing** |
| 14 | **Phase 12** ✅ | **Page Object Emitter** | **Complete: core emitter, diff mode, template detection, CLI `generate` subcommand, API-aware `waitForReady()` generation — 67 unit tests** |
| 15 | **Phase 13** ✅ | **Validation: Generated vs Hand-Written** | **Complete: structural comparison (19 tests), functional swap (16 tests × 7 apps), drift detection baselines + CI script** |
| 15.5 | **Network Settle** ✅ | **`networkSettleMiddleware`** | **Complete: auto-waits for in-flight HTTP requests after write/click actions — 7 tests × 7 apps** |
| 16 | Phase 14 | Source Scan Enrichment | Next: optional source-scan enrichment layer |

---

## Phase 8: Framework Library _(estimated ~3–5 days)_

> Build the Playwright-based element interaction library. Full design in [REQUIREMENTS.md §11](../docs/REQUIREMENTS.md).

### 8.1 Core (`By` + Element Types) — validate against vanilla-html
- [x] Implement `By` class with factories: `label()`, `role()`, `css()`, `text()`, `shadow()`, `within()`, `any()`, `first()`
- [x] `By.resolve()` accepts `Scope` type (`Page | Locator`) for both top-level and nested/scoped lookups
- [x] Implement core element types: `checkbox`, `select`, `button`, `text`, `textInput` — each takes `(by: By, scope: Scope)`
- [x] Implement `pageElements(scope, dict)` resolver — hydrates a dictionary of `{ type, by: By }` entries into typed elements
- [x] Write tests against vanilla-html (port 3001) validating: filter checkbox, category select, Add to Cart button, action output text

### 8.2 Table + Remaining Types — validate against vanilla-html
- [x] Implement `table` type: `sort()`, `rows()`, `rowCount()`, `filter()`
- [x] Implement `stepper` type: `increment()`, `decrement()`, `set()`, `read()`
- [x] Implement `datePicker` type: `select()`, `read()` (native adapter only)
- [x] Implement `radio` type: `choose()`, `read()`
- [x] Implement `dialog` type: `open()`, `close()`, `isOpen()`
- [x] Implement `toast` type: `read()`, `isVisible()`, `waitForDismiss()`
- [x] Full test suite passes against vanilla-html

### 8.3 Group Element + Handler Registry
- [x] Implement `group` element: `set(label, value)`, `get(label)`, `setAll()`, `getAll()`, `find()`, `click()`, `locator()`
- [x] Implement handler registry (`handlers.ts`) — single source of truth for detection + set/get
- [x] 10 element types in priority order: checkbox, radio, slider, select, textarea, switch, combobox, radiogroup, checkboxgroup, input (fallback)
- [x] `DetectRule` interface: tags, inputTypes, roles, requireChild, attr — all serialisable
- [x] `detectHandler()` — classifies DOM element in a single `evaluate()` call
- [x] `resolveLabeled()` — two-phase resolution: getByLabel → role-based fallback chain
- [x] `roleFallbacks` auto-derived from handler detect rules — no manual sync
- [x] Root group pattern: `...group(By.css("body"), page)` spread for page-level set/get
- [x] Page composition pattern: root group spread + typed wrappers for rich behaviour
- [x] Tests: 75 passing across 10 spec files (by-strategies, button-output-toast, dialog, dynamic-content, group-filter-bar, group-order-controls, navigation, override-escape, table-data, table-rows)

### 8.4 Nested Elements
- [x] `find(identifierBy, matchValue)` — narrowing from multiple containers (via `locator.filter()`)
- [ ] ~~`children` support in `pageElements` dictionaries~~ — superseded by group's `find()` pattern
- [ ] ~~`nth()` and `containing()` via `pageElements`~~ — superseded by group's `find()` pattern
### 8.4.1 v0.1.1 Hardening
- [x] Custom error classes: `ElementNotFoundError`, `AmbiguousMatchError`, `ColumnNotFoundError` (replaces plain `new Error()`)
- [x] Remove `By.semantic()` — redundant with `By.css()` for tag-name lookup
- [x] `group.find()` is now `async`, defaults to `exact: true`, throws on 0 or >1 matches
- [x] `DialogAdapter` pattern — mirrors `DatePickerAdapter` for technology-agnostic modal interaction
- [x] Remove deprecated `By.firstAsync()` (alias for `By.first`)
- [x] Export `FindOptions`, `DialogAdapter`, `DialogOptions`, `nativeDialogAdapter` from public API
### 8.5 Framework App Validation + Technology Adapters _(complete — 2026-03-07)_
- [x] Run vanilla-html tests against react-app — identify failures
- [x] Build react-datepicker adapter for `datePicker` type
- [x] Build vue-datepicker adapter (`@vuepic/vue-datepicker`)
- [x] Build mat-datepicker adapter (Angular Material)
- [x] Build flatpickr adapter (Svelte)
- [x] Fix dialog close strategy for non-native dialogs (CDK overlay, `<dialog open>` pattern)
- [x] Fix stepper fill strategy for framework-controlled readonly inputs
- [x] Fix page objects for cross-app selector compatibility (navigation, dynamic content, select ambiguity, shadow DOM)
- [x] Repeat for vue-app, angular-app, svelte-app, nextjs-app, lit-app
- [x] Run against lit-app — validate shadow DOM piercing via `By.shadow()`
- [x] All 700 integration tests pass against all 7 apps (100% pass rate)
- [x] See `framework/PLAN.md` for detailed execution log

---

## Phase 9: Framework Simplification Sprint _(complete — 2026-03-04)_

> **Status:** Complete — all 112 architecture issues closed, 0 remaining. Work was completed on 2026-03-04 prior to Phase 8.5 cross-app validation.
> **Ref:** [framework/ARCHITECTURE_ISSUES.md](../framework/ARCHITECTURE_ISSUES.md)

### Rationale

The framework carried backward-compatibility cruft, premature optimizations, and rarely-used features. All were eliminated — the codebase now has 0 open architecture issues.

### 9.1 Delete Backward-Compatibility Cruft (~8 issues eliminated)

Remove code that exists only for migration from earlier API versions that no consumers depend on.

- [x] Delete `NonRetryableError` class from `src/errors.ts` — deprecated, misdesigned (Issues 23, 70)
- [x] Delete `setActiveContext()` from `src/context.ts` — always throws, dead code (Issue 45)
- [x] Delete `baseProps()` from `src/elements/base.ts` — superseded by `buildElementFromProvider()` (Issue 47)
- [x] Delete `Object.setPrototypeOf` calls from all error classes — unnecessary for ES2022 target (Issue 22)
- [x] Delete the legacy exception-based overload from `retryUntil` in `src/retry.ts` — result-based API is the only supported path (Issues 2, 70)
- [x] Remove `NonRetryableError` export from `src/index.ts` and `src/extend.ts`
- [x] Update all `@deprecated` references in JSDoc comments
- [x] Verify: `npx tsc --noEmit` passes, `npx playwright test` passes

**Issues resolved:** 2, 22, 23, 45, 47, 70 (partial: 26, 68)

### 9.2 Delete Shadow DOM Fast Path in Table (~5 issues eliminated)

The `evaluate()` fast path in `table.ts` was a premature optimization. It introduces a Shadow DOM probe, duplicated code paths, and silent error swallowing. The Locator-based slow path handles both Shadow and non-Shadow DOM correctly.

- [x] Remove the `hasShadow` probe and `evaluate()` fast path from `rows()`
- [x] Remove the `hasShadow` probe and `evaluate()` fast path from `findRow()` / `scanRowsEvaluate()`
- [x] Always use the Locator-based path (`scanRowsLocator`)
- [x] Remove the `.catch(() => true)` silent error swallowing (Issue 33)
- [x] Verify: `npx tsc --noEmit` passes, `npx playwright test` passes

**Issues resolved:** 13, 30, 33 (partial: 31, 60, 61)

### 9.3 Simplify Table Sort — Delete Strategies 2 and 3 (~5 issues eliminated)

The three-tier sort fallback cascade (text content → `aria-label` substring → `data-sort` attribute) causes duplicated regex, substring false-positives, and multiple `loc()` resolutions. Keep only Strategy 1 (exact text match after cleaning) — it covers all current test targets.

- [x] Extract header-cleaning regex (`/[⇅↑↓▲▼]/g`) to a shared constant or function — `cleanHeaderText()` helper
- [x] Have `sort()` delegate to `readHeaders()` for clean column name lookup
- [x] Have `rows()` delegate to `readHeaders()` for header text (eliminates duplicated regex)
- [x] Delete Strategy 2 (`aria-label*=` substring match) from `sort()`
- [x] Delete Strategy 3 (`data-sort` attribute) from `sort()`
- [x] Resolve `loc()` once at top of `sort()` — `const tableEl = await loc();`
- [x] Verify: `npx tsc --noEmit` passes, `npx playwright test` passes

**Issues resolved:** 39, 40, 52, 76 (partial: 53)

### 9.4 Decide on `normalize` Feature (~3 issues eliminated)

`normalize` exists in `LabelActionOptions` but is silently dropped by `group.write()`/`group.read()` and `radio.options()`. Either wire it through properly or delete it.

- [x] **Option A (chosen): Removed `normalize` from `LabelActionOptions`** — no consumer used it; dead option deleted
- [ ] ~~Option B: Wire through~~ — not needed
- [x] Verified: no compile errors, all tests pass

**Issues resolved:** 3, 46 (partial: 9)

### 9.5 Fix `retryUntil` Non-Retryable Catch Bug (~15 min, critical)

This is a real bug (🔴 High) that wastes 5 seconds of CI time on every non-transient failure.

- [x] Move the non-retryable `throw` outside the local `try/catch` in `src/retry.ts` (Issue 75) — sentinel pattern applied
- [x] Add unit test for the fix
- [x] Verify: `npx tsc --noEmit` passes, `npx playwright test` passes

**Issues resolved:** 75

### 9.6 Backlog Triage — Remaining Issues _(complete)_

All issues from both categories were resolved on 2026-03-04:

**Missing test coverage (~20 issues) — all closed with tests added:**
- Issues 26, 34, 35, 36, 44, 48, 56, 57, 58, 62, 63, 64, 65, 68, 69, 73, 74

**Genuine improvements (~15 issues) — all closed with fixes applied:**
- Issues 1, 4, 5, 6, 10, 11, 12, 14, 27, 28, 29, 38, 41, 50, 51, 54, 55, 59, 60, 66, 67, 71, 72

### Post-Simplification Validation

- [x] Full build: `npx tsc --noEmit` — zero errors
- [x] Full test suite: `npx playwright test` — 700/700 integration + 171 unit tests pass (unit count later grew to 219 in Phase 10.8)
- [x] `framework/ARCHITECTURE_ISSUES.md` — all 112 issues in "Closed Issues" section
- [x] Issue counts updated: 0 open, 112 closed

---

## Tips

- **Don't over-build the apps.** If you're spending more than 3 hours on a single app, you're adding too much. These are test fixtures with a store theme, not real e-commerce apps.
- **Use the vanilla-html app as your behavioral reference.** When in doubt about how a contract element should *behave*, check the vanilla baseline. Don't copy its DOM — the point is different DOM, same behavior.
- **Lit and Shadow DOM will be the most interesting.** They'll force you to think about selector and interaction strategies. That's the point.
- **Commit after each phase.** Each phase is a stable checkpoint.

---

## Phase 9.5: Pre-Phase 10 Prerequisites _(~3–4 hours)_

> **Architecture review (2026-03-15) identified critical gaps that will block every Phase 10 app migration.** These must be addressed before starting any component library migration. Without these fixes, the first `write("Category", "Electronics")` call against any component library select will throw.

### 9.5.1 Create `SelectAdapter` Interface _(~1 hour)_

> The `comboboxSet` handler (Issue 113) calls `el.clear()` then `el.fill()`, assuming an editable `<input>`. Every component library select (`<mat-select>`, MUI `<Select>`, `<v-select>`, `<sl-select>`, shadcn `<Select>`) renders `role="combobox"` on a non-editable `<div>` — `fill()` will throw. This is the single highest-risk gap for Phase 10.

- [x] Create `src/elements/select-adapter.ts` with `SelectAdapter` interface:
  ```ts
  interface SelectAdapter {
    select(locator: Locator, value: string, options?: ActionOptions): Promise<void>;
    read(locator: Locator, options?: ActionOptions): Promise<string>;
  }
  ```
- [x] Implement `nativeSelectAdapter` as default (wraps current `selectOption` / `readSelectedOptionText` logic)
- [x] Wire `SelectAdapter` into page object options (same injection pattern as `datePickerAdapter`)
- [x] Update `comboboxSet` to detect editable vs non-editable combobox:
  - If the element is an `<input>` or `<textarea>` (editable): use current `fill()` path
  - If the element is non-editable (`<div>`, `<button>`, etc.): delegate to `SelectAdapter.select()`
- [x] Add unit tests: native adapter delegates correctly, custom adapter is injected and called
- [x] Verify: 700/700 integration + unit tests still pass (native select behavior unchanged)

### 9.5.2 Expand `clickInContainer` Role Cascade _(~30 min)_

> `clickInContainer` (Issue 115) only tries `button` → `link` → `getByText()`. Component libraries render clickable elements as `menuitem`, `tab`, `option`, etc. The narrow cascade will cause false negatives.

- [x] Add `menuitem`, `tab`, `menuitemcheckbox`, `menuitemradio` to the role cascade in `src/dom-helpers.ts`
- [x] Verify: existing tests still pass (no regressions from wider cascade)

### 9.5.3 Document Shoelace Shadow DOM Risk _(~15 min)_

> Shoelace's nested shadow roots may defeat `requireChild` detection (Issue 116). No code change needed yet — just document the expected fix path so Phase 10.6 doesn't get blocked by a surprise.

- [x] Add a comment block in `src/element-classifier.ts` near the `requireChild` logic noting that Shoelace components nest shadow roots and may need tag-based detect rules instead of `requireChild`
- [x] Add a note in Phase 10.6 checklist referencing Issue 116

### Exit Criteria
- [x] `SelectAdapter` interface exists and is wired into context/page options
- [x] `comboboxSet` handles both editable and non-editable combobox elements
- [x] `clickInContainer` cascade includes common ARIA widget roles
- [x] 700/700 integration tests + 171 unit tests pass (unit count later grew to 219 in Phase 10.8)
- [x] No behavioral changes to existing native HTML interactions

---

## Phase 10: Make Apps Idiomatic ✅ _(complete — 2026-03-15)_

> **This was the primary validation milestone.** Replaced raw HTML elements with each framework's native component library. The framework now handles genuinely different DOM structures across 6 component libraries + vanilla HTML — not 7 copies of the same native HTML.
>
> **Result: 700/700 integration tests + 219 unit tests passing.** Every app uses its ecosystem's idiomatic component library, producing fundamentally different DOM (shadow DOM, portaled dropdowns, ARIA widgets, virtual tables). The framework handles all of them with generic ARIA/role-based detection — library-specific logic is isolated in adapters (DatePickerAdapter, SelectAdapter, checkbox force-click fallback).
>
> **Actual timeline:** ~8 days. Lit + Shoelace (Phase 10.6) was the hardest due to deeply nested shadow DOM requiring a major `SelectAdapter` rewrite with render-flush logic and expanded-but-invisible recovery. A checkbox `force: true` regression across React/Angular/Next.js was caught and fixed with a try-then-fallback pattern.

**Component libraries used:**
| App | Library | Version |
|-----|---------|---------|
| Vanilla HTML | None (baseline) | — |
| Angular | Angular Material | ^19.2.19 |
| React | MUI (Material UI) | ^7.3.9 |
| Vue | Vuetify | ^4.0.2 |
| Svelte | Bits UI | ^2.16.3 |
| Next.js | MUI (Material UI) | ^7.3.9 |
| Lit | Shoelace | ^2.20.1 |

**Guiding principle applied:** Each app looks like a senior developer in that ecosystem would build it. Same business domain (products, categories, filters), completely different DOM.

**Critical dependency fulfilled:** Phase 10.7 (framework handler updates) was interleaved with 10.1–10.6. Each app migration broke tests; those breaks were triaged and fixed in the framework before moving to the next app.

### 10.0 Vanilla HTML — No Changes _(baseline, complete)_

Vanilla HTML is the reference. Raw `<select>`, `<table>`, `<dialog>`, `<input type="date">` are correct here.

- [x] Verify: still passes 100/100 integration tests
- [x] Document as "baseline — intentionally raw HTML"

### 10.1 Angular App — Finish Angular Material _(complete — 2026-03-15)_

> Angular Material was already installed for dialog, snackbar, and datepicker. This phase migrated the remaining form elements and table.

- [x] `<select>` → `<mat-select>` inside `<mat-form-field>` with `<mat-label>`
- [x] `<input type="checkbox">` → `<mat-checkbox>`
- [x] `<input type="radio">` → `<mat-radio-group>` / `<mat-radio-button>`
- [x] `<table>` → `<mat-table>` with `MatTableDataSource` + `matSort`
- [x] `<input type="text">` (search) → `<mat-form-field>` + `<input matInput>`
- [x] Template-driven `[(ngModel)]` → Reactive Forms (`FormGroup` / `FormControl`)
- [x] Extract sub-components: `FilterBarComponent`, `ProductTableComponent`, `OrderControlsComponent`
- [x] Verify: 100/100 integration tests pass
- [x] Document: Angular Material `@angular/material` ^19.2.19

### 10.2 React App — Add MUI _(complete — 2026-03-15)_

> Migrated from raw HTML to Material UI (MUI).

- [x] `npm install @mui/material @emotion/react @emotion/styled`
- [x] `<select>` → MUI `<Select>` + `<FormControl>` + `<InputLabel>`
- [x] `<input type="checkbox">` → MUI `<Checkbox>` + `<FormControlLabel>`
- [x] `<input type="radio">` → MUI `<RadioGroup>` + `<Radio>` + `<FormControlLabel>`
- [x] `<table>` → MUI `<Table>` + `<TableSortLabel>`
- [x] `<input type="text">` → MUI `<TextField>`
- [x] `<dialog>` → MUI `<Dialog>`
- [x] Toast → MUI `<Snackbar>` + `<Alert>`
- [x] Keep `react-datepicker` (already idiomatic)
- [x] Extract sub-components: `FilterBar.tsx`, `ProductTable.tsx`, `OrderControls.tsx`
- [x] Verify: 100/100 integration tests pass
- [x] Document: MUI `@mui/material` ^7.3.9

### 10.3 Vue App — Add Vuetify _(complete — 2026-03-15)_

> Migrated from raw HTML to Vuetify 4.

- [x] `npm install vuetify` + configure plugin
- [x] `<select>` → `<v-select>` with `label` prop
- [x] `<input type="checkbox">` → `<v-checkbox>` with `label` prop
- [x] `<input type="radio">` → `<v-radio-group>` + `<v-radio>`
- [x] `<table>` → `<v-data-table>` with `:headers` + `:items` + sortable
- [x] `<input type="text">` → `<v-text-field>`
- [x] `<dialog>` → `<v-dialog>` + `<v-card>`
- [x] Toast → `<v-snackbar>`
- [x] Keep `@vuepic/vue-datepicker` (already idiomatic)
- [x] Extract sub-components: `FilterBar.vue`, `ProductTable.vue`, `OrderControls.vue`
- [x] Verify: 100/100 integration tests pass
- [x] Document: Vuetify `vuetify` ^4.0.2

### 10.4 Svelte App — Add Bits UI _(complete — 2026-03-15)_

> Uses Svelte 5 runes, `bind:`, and actions. Migrated from raw HTML to Bits UI (headless primitives — Radix-style) rather than shadcn-svelte, as Bits UI is the lower-level building block and better stresses the framework with portaled/teleported dropdowns.

- [x] Install Bits UI (`bits-ui` ^2.16.3)
- [x] `<select>` → Bits UI `<Select.Root>` / `<Select.Trigger>` / `<Select.Content>` / `<Select.Item>` (renders `role="combobox"` with portaled dropdown)
- [x] `<input type="checkbox">` → Bits UI `<Checkbox.Root>` (renders `role="checkbox"`)
- [x] `<input type="radio">` → Bits UI `<RadioGroup.Root>` / `<RadioGroup.Item>` (renders `role="radiogroup"` + `role="radio"`)
- [x] `<table>` — kept as raw `<table>` (Bits UI has no table primitive)
- [x] `<input type="text">` — kept as native `<input>` with `<label>` (Bits UI has no text input)
- [x] `<dialog open>` → Bits UI `<Dialog.Root>` / `<Dialog.Portal>` / `<Dialog.Overlay>` / `<Dialog.Content>`
- [x] Toast — kept as custom implementation (Bits UI has no toast)
- [x] Keep `flatpickr` via action (already idiomatic Svelte pattern)
- [x] Extract sub-components: `FilterBar.svelte`, `ProductTable.svelte`, `OrderControls.svelte`
- [x] Verify: 100/100 integration tests pass

### 10.5 Next.js App — Add MUI + Next.js Patterns _(complete — 2026-03-15)_

> Same component library as React (MUI) plus Next.js-specific patterns (server/client components).

- [x] `npm install @mui/material @emotion/react @emotion/styled`
- [x] Same MUI component replacements as React app (10.2)
- [x] Break `HomeClient.tsx` monolith into extracted client components
- [x] Use server components where appropriate (static content, nav)
- [x] Keep `react-datepicker` and `react-hot-toast` (already library components)
- [x] Verify: 100/100 integration tests pass
- [x] Document: MUI `@mui/material` ^7.3.9

### 10.6 Lit App — Add Shoelace _(complete — 2026-03-15)_

> Lit patterns (decorators, tagged templates, web components) are idiomatic. This was the hardest migration due to Shoelace's deeply nested shadow DOM.

> **Shadow DOM challenges (resolved):**
> Shoelace components nest multiple shadow roots (e.g. `<sl-select>` → shadow → `<sl-popup>` → shadow → `<sl-option>`).
> After migration, the framework's `SelectAdapter` required a major rewrite: double `requestAnimationFrame` render flush,
> recovery logic for `expanded=true` but invisible dropdown, 4-strategy option-finding cascade, and `.value=` property
> binding in Lit templates to prevent Shoelace re-render conflicts.

- [x] `npm install @shoelace-style/shoelace` (^2.20.1)
- [x] `<select>` → `<sl-select>` + `<sl-option>` (renders `role="combobox"` with deeply nested shadow DOM)
- [x] `<input type="checkbox">` → `<sl-checkbox>` (renders `role="checkbox"`)
- [x] `<input type="radio">` → `<sl-radio-group>` + `<sl-radio>` (renders `role="radiogroup"` + `role="radio"`)
- [x] `<table>` — kept as raw `<table>` (Shoelace has no table component)
- [x] `<input type="text">` — kept as `<sl-input>` where applicable
- [x] Dialog — kept as custom `<general-store-dialog>` (Lit native web component)
- [x] Toast — kept as custom `<general-store-toast>` (Lit native web component)
- [x] Date picker — kept as native `<input type="date">` inside shadow DOM
- [x] Verify: 100/100 integration tests pass

### 10.7 Framework Handler Updates _(complete — interleaved with 10.1–10.6)_

> Component libraries produce fundamentally different DOM than raw HTML. Framework handlers, adapters, and detect rules were updated incrementally after each app migration.

**Key framework changes made during Phase 10:**

1. **SelectAdapter rewrite** (`select-adapter.ts`): Double `requestAnimationFrame` render flush before opening dropdowns; recovery logic when `aria-expanded="true"` but no options visible (close + retry); 4-strategy option-finding cascade (aria-controls → nearby XPath → page-level getByRole → CSS selectors); `read()` uses `inputValue()` for `<input>`/`<textarea>` tags.

2. **Checkbox try-then-fallback** (`checkbox.ts`, `default-handlers.ts`): `check()` and `uncheck()` try normal interaction first, fall back to `force: true` only on failure. This handles both MUI (hidden native `<input>`) and Shoelace (shadow DOM `role="checkbox"`) without breaking either.

3. **Radiogroup ARIA fallback** (`default-handlers.ts`): `radiogroupSet` falls back from `getByLabel(label).check({ force: true })` to `getByRole("radio", { name: label }).click()` for ARIA radios (Bits UI, Shoelace).

4. **Detect rule reordering**: Role-based detect rules moved before tag-based rules (e.g., `{ roles: ["radiogroup"] }` before `{ tags: ["fieldset"] }`) so component libraries that use ARIA roles are detected correctly.

5. **Combobox readonly routing** (`default-handlers.ts`): `comboboxSet`/`comboboxGet` check `isReadOnly` on the input — readonly inputs (Shoelace `<sl-select>`) are routed to the non-editable `SelectAdapter` path.

6. **Label resolution** (`label-resolution.ts`): Added text content fallback after trying `aria-label`, `label[for]`, and wrapping `<label>`. `readCheckedRadioLabel` tries native `:checked` then `[aria-checked="true"]`.

- [x] Role-based detect rules for all component libraries (MUI, Vuetify, Angular Material, Shoelace, Bits UI)
- [x] SelectAdapter handles portaled/shadow DOM dropdowns across all libraries
- [x] Checkbox/Radio adapters handle both native `<input>` and ARIA `role` elements
- [x] No library-specific code paths in the detection layer — library-specific logic is isolated in adapters (`DatePickerAdapter`, `SelectAdapter`, checkbox `force: true` fallback)
- [x] Verify: 700/700 integration + 171 unit tests pass after all apps migrated (unit count later grew to 219 in Phase 10.8)

---

## Phase 10.8: Post-Review Stabilization _(~2 days)_

> **Prerequisite for Phase 11.** Four independent review agents (code quality, architecture, test quality, documentation) scored the framework 5.4/10 overall and identified 8 P0 issues that will compound during Phase 11 crawler work. Full findings in [REVIEW_SYNTHESIS.md](REVIEW_SYNTHESIS.md).

### 10.8.1 Remove `expect` from production code _(complete — 2026-03-15)_

- [x] Remove `import { expect } from "@playwright/test"` from `select-adapter.ts`
- [x] Replace `expect(locator).toHaveAttribute("aria-expanded", "true", { timeout })` with `getAttribute()` polling loop (50ms intervals, 2s deadline)
- [x] Verify: no `@playwright/test` imports outside test files and `test-fixture.ts` — all remaining imports are `import type` (erased at compile time)

### 10.8.2 Fix cross-layer dependency _(complete — 2026-03-15)_

- [x] Move `genericNonEditableSelectAdapter` out of `elements/select-adapter.ts` into `adapters/generic-select-adapter.ts`
- [x] Ensure handler layer does not import from element layer — `default-handlers.ts` now imports from `adapters/`
- [x] Verify: clean dependency direction (handlers → adapters, elements → handlers)

### 10.8.3 Replace empty `catch {}` blocks _(complete — 2026-03-15)_

- [x] Audit all `catch {}` blocks in `select-adapter.ts` (~6), `checkbox.ts` (~2), `default-handlers.ts` (~1)
- [x] Added `isRetryableInteractionError()` helper to `playwright-errors.ts` — covers timeout, detached, intercepted click, not-visible, animating, out-of-viewport
- [x] All 9 empty catches now use `catch (e) { if (!isRetryableInteractionError(e)) throw e; }` — retryable errors continue, unexpected errors propagate
- [x] Zero empty `catch {}` blocks remain in production source

### 10.8.4 Unit tests: element classifier _(complete — 2026-03-15)_

- [x] Create `tests/unit/element-classifier.spec.ts`
- [x] Test: Phase 1 tag/inputType matching (4 tests) — tag, textarea, inputType filter, inputType mismatch
- [x] Test: Phase 1 role matching (3 tests) — ARIA role, role on non-input, radiogroup
- [x] Test: Phase 1 attribute matching (2 tests) — attr pair match, attr value mismatch
- [x] Test: Phase 2 `requireChild` verification (2 tests) — child found, child not found
- [x] Test: priority ordering (3 tests) — first handler wins, requireChild vs direct match priority
- [x] Test: `NoHandlerMatchError` (3 tests) — thrown on no match, includes tag info, includes role info
- [x] Test: fallback option (2 tests) — returns fallback instead of throwing, correct handler still wins
- [x] Test: multiple detect rules per handler (2 tests) — first applicable rule, role fallback
- [x] Total: 21 focused tests, all passing

### 10.8.5 Unit tests: label resolution _(complete — 2026-03-15)_

- [x] Create `tests/unit/label-resolution.spec.ts`
- [x] Test: `normalizeRadioLabel()` (9 tests) — plain label, trim, em dash, en dash, regular hyphens, edge cases
- [x] Test: `resolveInputLabel()` (6 tests) — aria-label, label[for], wrapping label, text content fallback, empty, priority
- [x] Test: `readCheckedRadioLabel()` (4 tests) — native :checked, aria-checked fallback, no checked, priority
- [x] Test: `resolveLabeled()` (8 tests) — empty label rejection, getByLabel resolution, getByRole fallback, ElementNotFoundError, error details
- [x] Total: 27 focused tests, all passing
- [x] Unit test count: 171 → 219 (+48 from classifier + label-resolution)

### 10.8.6 Fix stale documentation ✅

_Completed: Fixed all stale method names, test counts, and file references across 3 documentation files._

- [x] Fix method names in REQUIREMENTS.md §11: `set()`→`write()`, `get()`→`read()`, `setAll()`→`writeAll()`, `getAll()`→`readAll()` (~15 occurrences)
- [x] Fix method names in root README.md
- [x] Remove `FRAMEWORK_DESIGN.md` reference (doesn't exist) → updated to note §11 in REQUIREMENTS.md
- [x] Update `handlers.ts` references → `handler-registry.ts` / `default-handlers.ts`
- [x] Update root README: correct test count (919), phase status (Phases 0–10 complete), method names
- [x] Update framework/README.md: test counts (871→919), unit test count (171→219, 13→15 files), add element-classifier + label-resolution specs
- [x] Fix SelectAdapter path reference in framework/README.md (interface in elements/, implementation in adapters/)

### 10.8.7 Extract magic timeouts ✅

_Completed: Created `src/timeouts.ts` with 9 named constants; replaced all hardcoded timeout/retry values in 3 source files._

- [x] Define named constants in `src/timeouts.ts`: `TOGGLE_FIRST_ATTEMPT_MS`, `SELECT_CLICK_TIMEOUT_MS`, `SELECT_MAX_RETRIES`, `SELECT_RETRY_DELAY_MS`, `SELECT_EXPAND_DEADLINE_MS`, `SELECT_OPTION_VISIBLE_MS`, `COMBOBOX_MAX_RETRIES`, `COMBOBOX_RETRY_DELAY_MS`, `POLL_INTERVAL_MS`
- [x] Replace hardcoded `2000`, `150`, `15`, `3000`, `1000`, `10`, `100`, `50` across `default-handlers.ts`, `checkbox.ts`, `generic-select-adapter.ts`
- [x] Zero remaining magic timeout numbers in affected files

- [x] **Final gate: 700/700 integration + 219 unit tests pass**

---

## Phase 11: Runtime Crawler _(~2–3 days)_

> Build a CLI tool that crawls a running app page, discovers **groups and containers**, and emits a JSON manifest. The framework's handler registry handles element-level detection at interaction time — the crawler only needs to find the **named regions** of the page.

### Design Decisions

- **Groups, not elements.** The framework's `group.write()` auto-detects element types (select, checkbox, radio, etc.) at runtime via the handler registry. The crawler doesn't need to classify individual controls — it just finds the sections they live in.
- **4 special wrappers.** Only `table()`, `dialog()`, `toast()`, and `datePicker()` need explicit detection because they have interaction semantics that `group()` can't express. Everything else is `group()` at different scoping levels.
- **User-driven multi-pass.** The crawler doesn't automate interactions. The user puts the page in a desired state (opens a dialog, selects an option that reveals a section), then re-runs the crawler. The manifest is **append-only** — new groups get added, existing groups are never removed.
- **Dialogs are groups with lifecycle.** Always-in-DOM dialogs (e.g., Angular Material `<mat-dialog>` that stays in the tree) are discovered in pass 1. Portaled dialogs (React portals, Vue teleport, Angular CDK overlay) only exist in the DOM when triggered — the user opens them, then runs pass 2. Either way, a dialog is just a group scoped to `role="dialog"`. The framework handles inner elements at runtime; the crawler doesn't need to know what's inside.
- **Side panels are landmark groups.** Sidebars, drawers, and panels are discovered via standard landmark roles (`<aside>`, `role="complementary"`, `role="navigation"`). No special crawler logic needed — they're just groups with a landmark selector. Panels that slide in/out via CSS (always in DOM) are found in pass 1; panels injected into the DOM on open need pass 2.
- **API dependency discovery is optional.** The crawler _can_ intercept network calls during page load and annotate groups with the API endpoints they depend on. This is an **optional annotation** in the manifest, not a core crawler concern. It enables the emitter to generate `waitForReady()` stubs, but the page objects work without it.
- **Template detection is an emitter concern.** The crawler produces per-page manifests. The emitter (Phase 12) compares manifests across routes and extracts shared structures into template factory functions. The crawler doesn't need to know about templates — it just crawls one page at a time.
- **Source scan is deferred to Phase 14.** The crawler produces labels that can be used as search keys for a guided source grep — but that's optional enrichment, not a prerequisite.

### 11.0 Project Setup

- [x] Create `packages/crawler/` (or `tools/crawler/`) with its own `package.json`
- [x] TypeScript + Playwright dependency (uses Playwright to visit live pages)
- [x] CLI entry point: `bin/pw-crawl.ts`
- [x] Manifest output path: `--output manifest.json` (default: stdout)
- [x] Test harness: integration tests that crawl the 7 fixture apps

### 11.1 Group Discovery _(core algorithm)_

> Single `querySelectorAll` for landmark/container elements, then extract label + classify type.

- [x] Query for all group-like elements in one pass:
  ```
  nav, header, footer, main, aside, section[aria-label],
  fieldset, form, table, dialog, details,
  [role="navigation"], [role="region"][aria-label],
  [role="group"][aria-label], [role="toolbar"],
  [role="tablist"], [role="menu"], [role="menubar"]
  ```
- [x] For each discovered group, extract its label via an 11-priority resolution chain:
  1. `aria-label` attribute
  2. `aria-labelledby` → resolve referenced element's text (filtered for framework-generated IDs)
  3. `<legend>` child (for `<fieldset>`)
  4. `<summary>` child (for `<details>`)
  5. Direct heading child (`<h1>`–`<h6>`, immediate children only)
  6. Deep descendant heading (any nested `<h1>`–`<h6>`, e.g., MUI Dialog content)
  7. `title` attribute
  8. Nearest ancestor's `aria-label` (walks up the DOM tree)
  9. First meaningful text content (via TreeWalker)
  10. `id` attribute (if human-authored, not a framework-generated ID)
  11. Fallback: tag name
- [x] Framework ID filtering: reject React (`_r_N_`, `:rN:`), Vue (`data-v-`, `__vue`), Angular (`_ng`) generated IDs from label resolution
- [x] Classify group type: `nav`, `form`, `fieldset`, `region`, `toolbar`, `tablist`, `generic`
- [x] Test: crawl `apps/vanilla-html` at `/`, assert discovered groups match hand-written `homePage()` structure

### 11.2 Special Wrapper Detection

> Detect the 4 element types that need typed wrappers instead of `group()`.

- [x] **Table:** `<table>` or `role="table"` → emit `table()` entry
- [x] **Dialog:** `<dialog>` or `role="dialog"` → emit `dialog()` entry
- [x] **Toast:** `[aria-live="polite"]` or `[aria-live="assertive"]` → emit `toast()` or `text()` entry
- [x] **Date picker:** flag as `needs-adapter` — no reliable universal DOM signal; engineer fills in manually
- [x] Test: crawl home page, assert table/dialog/toast are correctly identified

### 11.3 Manifest Schema + Merge Logic

> The manifest is the single output artifact. Must support append-only merging across multiple crawler passes.

- [x] Define manifest JSON schema:
  ```json
  {
    "url": "/",
    "timestamp": "...",
    "groups": [
      { "label": "...", "selector": "...", "type": "group|table|dialog|toast",
        "discoveredIn": "pass-1", "visibility": "static" }
    ]
  }
  ```
- [x] Merge algorithm: when re-crawling with an existing manifest:
  - Groups matched by `selector` are updated (label refresh, timestamp bump)
  - New groups are appended with `discoveredIn: "pass-N"`
  - Groups not found in current DOM are **kept** (append-only) with a `lastSeen` timestamp
- [x] User can manually delete stale entries from the manifest
- [x] Test: crawl page in default state → re-crawl with dialog open → assert dialog entry was added, original groups preserved

### 11.4 CLI Interface

- [x] `npx pw-crawl <url>` — crawl page, emit manifest to stdout
- [x] `npx pw-crawl <url> -o manifest.json` — write/merge to file
- [x] `npx pw-crawl <url> -o manifest.json --pass 2` — merge pass (append-only)
- [x] `npx pw-crawl <url> --scope ".main-content"` — limit crawl to a section
- [x] `npx pw-crawl <url> --diff manifest.json` — compare current DOM to existing manifest, report additions/removals
- [x] Exit code: `0` if no drift, `1` if manifest changed (useful for CI)

### 11.5 Cross-App Validation

- [x] Crawl all 7 apps (vanilla, react, vue, angular, svelte, nextjs, lit)
- [x] Assert: each crawl discovers the same logical groups despite different DOM implementations
- [x] Assert: the manifest for each app is sufficient to generate a page object equivalent to the hand-written one
- [x] Document differences (e.g., Angular Material wraps groups differently than raw HTML) — see `tools/crawler/README.md`

### 11.6 API Dependency Discovery _(optional)_

> Intercept network calls during a crawl pass and annotate manifests with the API endpoints each page depends on. This enables the emitter to generate `waitForReady()` stubs but is **not required** for page object generation.

- [x] Use Playwright's `page.on('response')` to capture all fetch/XHR requests during page load
- [x] Record each endpoint's URL pattern, HTTP method, and timing (relative to navigation start)
- [x] Emit in manifest:
  ```json
  {
    "apiDependencies": [
      { "pattern": "/api/products*", "method": "GET", "timing": "page-load" },
      { "pattern": "/api/categories", "method": "GET", "timing": "page-load" }
    ]
  }
  ```
- [x] Distinguish `timing: "page-load"` (fires on navigation) vs `timing: "interaction"` (fires after user action during multi-pass)
- [x] CLI flag: `--observe-network` (off by default to keep default crawls fast)
- [x] Test: crawl an app that fetches data on load → assert API endpoints appear in manifest

---

## Phase 12: Page Object Emitter _(~1–2 days)_

> Take the crawler manifest and generate TypeScript page object files. The emitter is intentionally simple — it maps groups to `group()` calls and special wrappers to their typed factories.

### 12.0 Core Emitter

- [x] Input: manifest JSON from Phase 11
- [x] Output: TypeScript page object file importing from `@playwright-elements/core`
- [x] Emit `group(By.css("body"), page)` as root with `...root` spread
- [x] For each manifest group:
  - `type: "group"` / `"nav"` / `"region"` / `"fieldset"` → `group(By.role(...), page)` or `group(By.css(...), page)`
  - `type: "table"` → `table(By.role("table"), page)`
  - `type: "dialog"` → `dialog(By.role("dialog"), page)`
  - `type: "toast"` → `toast(By.css("[aria-live='polite']"), page)`
- [x] Generate camelCase property names from group labels (e.g., "Shipping Method" → `shippingMethod`)
- [x] Test: emit page object from vanilla-html manifest → output matches hand-written `homePage()` structure

### 12.1 Diff Mode

- [x] Compare generated page object against existing hand-written one
- [x] Report: added groups, removed groups, changed selectors
- [x] Option: `--update` to overwrite, `--check` for CI (exit 1 if drift detected)
- [ ] Preserve manually-added fields outside `// @generated` blocks _(deferred — requires AST-level merge)_
- [ ] Date picker entries emit with `// TODO: add adapter` comment _(deferred — needs adapter registry)_

### 12.2 Template Detection _(structural shape comparison)_

> When the crawler runs across multiple routes, the emitter can detect pages that share the same group layout and extract a template factory function. This avoids duplicating identical nav/header/footer definitions across every page object.

- [x] **Shape signature:** For each page manifest, compute a shape = sorted list of `(type, selectorPattern)` tuples, ignoring label text. Example: `[("group", "nav"), ("group", "main"), ("table", "table"), ("group", "footer")]`
- [x] **Route comparison:** When generating from multiple manifests, group routes by identical shape signatures
- [x] **Same-shape pages:** Routes with the same shape → extract shared structure into a `createPageTemplate()` factory
- [ ] **Varying labels become parameters:** If two routes share the same shape but differ in group labels (e.g., "Products Table" vs "Orders Table"), the varying labels become template config: _(deferred — current implementation shares full shape, label parameterization is a future refinement)_
  ```ts
  // Generated template
  function storePage(page: Page, config: { mainTableLabel: string }) {
    const root = group(By.css("body"), page);
    return {
      ...root,
      nav: group(By.role("navigation"), page),
      mainTable: table(By.label(config.mainTableLabel), page),
      footer: group(By.role("contentinfo"), page),
    };
  }
  // Generated per-route page objects
  const productsPage = (page: Page) => storePage(page, { mainTableLabel: "Products" });
  const ordersPage = (page: Page) => storePage(page, { mainTableLabel: "Orders" });
  ```
- [x] **Unique pages:** Routes with a unique shape get their own standalone page object (no template extraction)
- [x] **Multi-route crawling workflow:**
  1. `npx pw-crawl http://localhost:3001/ -o manifest.json` (home)
  2. `npx pw-crawl http://localhost:3001/about -o manifest.json --route about` (about)
  3. `npx pw-crawl generate manifest.json -o pages/` → emitter detects shared shapes and generates templates
- [x] Test: feed home + about manifests → assert shared nav/header/footer are extracted into template

### 12.3 CLI Interface

- [x] `npx pw-crawl generate manifest.json -o pages/` — emit page objects from manifest
- [x] `npx pw-crawl generate manifest.json --check pages/` — CI mode, exit 1 if different
- [x] Config file support: `.pw-crawl.json` for custom label → property name mappings, selector overrides

### 12.4 API-Aware Generation _(optional, requires 11.6)_

> If the manifest contains `apiDependencies` from the network observation pass, the emitter can generate `waitForReady()` helpers.

- [x] For each page manifest with `apiDependencies`, emit a `waitForReady()` function:
  ```ts
  /** Wait for page-load API calls to complete before interacting. */
  async function waitForReady(page: Page) {
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes("/api/products") && resp.status() === 200),
      page.waitForResponse(resp => resp.url().includes("/api/categories") && resp.status() === 200),
    ]);
  }
  ```
- [x] `waitForReady()` is emitted as a standalone export — not wired into the page object automatically (the engineer decides when/where to call it)
- [x] Emit `// Generated from observed API calls — verify these patterns match your backend` comment
- [x] Test: generate from manifest with `apiDependencies` → assert `waitForReady()` is present and correct

---

## Phase 13: Validation — Generated vs Hand-Written _(~1 day)_ ✅

> Use the 7 apps as a test suite. The hand-written `homePage()` and `aboutPage()` are the expected output.

### 13.0 Structural Comparison ✅

- [x] For each app: crawl → generate → compare output to hand-written page object
- [x] Assert: every `group()` in `homePage()` has a corresponding manifest entry
- [x] Assert: `table()`, `dialog()`, `toast()` entries are correctly typed
- [x] Assert: `datePicker()` is flagged as `needs-adapter` (engineer fills in manually)
- [x] Allow: generated page object may have **more** groups than hand-written (crawler finds everything, hand-written is curated)

**Tests:** `tools/crawler/tests/validation.spec.ts` — 19 tests per app (117 passed + 30 skipped across all apps)

### 13.1 Functional Swap Test ✅

- [x] Build runtime page objects from crawler manifests (`buildPageObjectFromManifest()`)
- [x] Exercise write/read/writeAll/readAll/click via generated page objects
- [x] Verify auto-detection: group().write() correctly invokes radio, checkbox, select, textbox handlers
- [x] Validate table, dialog, and toast wrappers from generated page objects
- [x] Document adjustments: date picker requires adapter; Lit/Shoelace `<sl-select>` ambiguous at body scope (use scoped group)

**Tests:** `framework/tests/functional-swap.spec.ts` — 16 tests per app (96 passed, 16 skipped across all apps)
**Known limitation:** 4 Lit tests marked `fixme` — Shoelace `<sl-select>` label "Category" is ambiguous at body scope (matches both select and table header). Hand-written page objects scope to `.filter-bar` to avoid this.

### 13.2 Drift Detection CI ✅

- [x] Script: crawl all 7 apps → save baseline manifests (`npm run save-baselines`)
- [x] If manifest changed → fail CI via `drift-check.spec.ts` or `check-drift.sh`
- [x] Runs as part of existing test pipeline alongside the integration tests

**Tests:** `tools/crawler/tests/drift-check.spec.ts` — 2 tests per app (manifest drift + page object drift)
**Scripts:** `tools/crawler/scripts/save-baselines.ts`, `tools/crawler/scripts/check-drift.sh`

---

## Network Settle Middleware _(post-Phase 13)_ ✅

> Add action-scoped network awareness so the framework automatically waits for in-flight HTTP requests to complete after write/click interactions — no manual `page.waitForResponse()` needed.

- [x] Extend `ActionContext` with `page?: () => Promise<Page>` provider (auto-derived from locator)
- [x] Extend `WrapElementMeta` to carry the page provider through element wrapping
- [x] Implement `networkSettleMiddleware` factory in `src/network-settle-middleware.ts`
  - Hooks `page.on("request")`, `page.on("requestfinished")`, `page.on("requestfailed")`
  - Configurable: `idleTime` (default 300ms), `timeout` (default 10s), `actions`, `ignore` patterns
  - Callback hooks: `onRequest`, `onRequestDone`, `onTimeout`
  - Graceful timeout — warns but doesn't throw
  - `displayName = "networkSettle"` for middleware positioning
- [x] Export from `extend.ts` (`networkSettleMiddleware`, `NetworkSettleOptions`)
- [x] 7 integration tests × 7 apps (49 total) covering: delayed API response, ignored URLs, action filtering, callbacks, timeout handling, concurrent requests
- [x] All 845 tests passing (49 network-settle + 796 existing), 0 regressions
- [x] Framework-agnostic test harness: MutationObserver + capturing click listener covers light DOM (MUI, Vuetify, Angular Material, Bits UI) and Shadow DOM (Shoelace/Lit)

---

## Phase 14: Source Scan Enrichment _(optional, ~2–3 days)_

> Use crawler labels as search keys to find source code locations. This is an optional enrichment layer — the crawler + emitter work without it.

### Rationale

The crawler tells you **what exists** on the rendered page. The source scan adds **where it comes from** — which file, which component, whether it's conditional, what state drives it. This is useful for large codebases where an engineer wants provenance, but not required for page object generation.

### 14.0 Guided Grep _(Level 1 — simple, high value)_

> For each label in the crawler manifest, grep the source for that string.

- [ ] For each manifest entry, search all source files for the label string
- [ ] Score results by proximity to HTML/template context (e.g., `aria-label="Category"` scores higher than a JS comment mentioning "Category")
- [ ] Output enriched manifest entry:
  ```json
  {
    "label": "Category",
    "source": { "file": "src/FilterBar.tsx", "line": 42, "component": "FilterBar" }
  }
  ```
- [ ] Handle: labels not found in source (dynamic/i18n/CMS-driven) → flag as `"source": "not-found"`
- [ ] Test: run against all 7 apps, measure hit rate

### 14.1 Conditional Detection _(Level 2 — framework-aware)_

> Identify whether a discovered group/element is conditionally rendered.

- [ ] When grep finds a label inside `{#if}`, `v-if`, `*ngIf`, `&&`, ternary → flag as `conditional: true`
- [ ] Regex-based heuristic (not full AST) — scan surrounding lines for conditional patterns
- [ ] Output: `"conditional": true` on manifest entry
- [ ] Cross-reference with crawler multi-pass data: if a group was `discoveredIn: "pass-2"`, the source scan can identify **why**

### 14.2 Component Library Identification _(Level 3 — nice to have)_

> Identify which component library renders an element.

- [ ] When grep finds `<MuiSelect>`, `<v-select>`, `<mat-select>`, `<sl-select>` near the label → record library
- [ ] Output: `"library": "MUI"` on manifest entry
- [ ] Useful for: knowing when a handler might need library-specific behavior

---

## Tips (updated)

- **Don't over-build the apps.** If you're spending more than 3 hours on a single app, you're adding too much. These are test fixtures with a store theme, not real e-commerce apps.
- **Use the vanilla-html app as your reference.** When in doubt about how a contract element should *behave*, check the vanilla baseline. But don't copy its DOM structure — the point is different DOM, same behavior.
- **Phase 10 is where the project proves its thesis.** The 700/700 pass rate from Phase 8.5 was against native HTML. Phase 10 is the real validation. Expect breakage; the fixes are the work.
- **Handler updates are interleaved, not batched.** Migrate one app, fix the framework, verify, then move to the next. Don't migrate 6 apps and try to fix everything at once.
- **The behavioral contract is the only shared contract.** Outcomes (filter results, sort order, toast text) must match across apps. DOM structure, tag names, and CSS classes will not match — and that's the point.
- **The crawler finds groups, the framework finds elements.** Don't try to classify individual controls in the crawler — `group.write()` handles that at runtime.
- **Multi-pass is user-driven.** The human knows what states matter. The crawler just snapshots and merges.
- **Dialogs and side panels are just groups.** The crawler doesn't need special logic for modals, drawers, or panels — they all resolve to groups scoped by landmark roles or `role="dialog"`.
- **Template detection happens at emit time, not crawl time.** The crawler produces per-route manifests. The emitter compares shapes across routes and extracts templates.
- **API discovery is opt-in.** Network observation adds value for data-driven pages but slows crawls. Default to off.
- **Source scan is optional.** The crawler + emitter produce usable page objects without ever looking at source code.
- **The existing 700 tests are your safety net.** After every app change, run the integration tests. If they break, the framework needs a new handler/detect rule — that's the feedback loop.
- **Phase 11 (Runtime Crawler) is complete.** Phases 12–14 (emitter, codegen, source scan) build on the crawler manifest.
- **`networkSettleMiddleware` is a framework extension, not a roadmap phase.** It extends the middleware pipeline with built-in network awareness. Use it in any test that triggers API calls from UI interactions.
- **Commit after each phase.** Each phase is a stable checkpoint.

---

*This roadmap is a companion to [REQUIREMENTS.md](../docs/REQUIREMENTS.md). Update both as decisions are made.*
