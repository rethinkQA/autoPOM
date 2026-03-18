# Architecture Issues Tracker

> **Purpose:** Persistent tracking of all project issues — framework, apps, tests, crawler, docs, infra.
> Any agent or developer can reference, update, or close items here.
> Last updated: 2026-03-18 (issues #151, #156, #157, #159, #160, #161, #169 resolved — final 8 issues batch)
> Previous updates: 2026-03-17 (issues #144, #145, #146, #149, #150, #164, #165 resolved — top-5 issue batch)
> Previous updates: 2026-03-17 (issues #143, #152, #153, #158, #166 resolved — top-5 issue batch)
> Previous updates: 2026-03-17 (issues #130, #131, #132, #133, #134 resolved — top-5 issue batch)
> Previous updates: 2026-03-17 (issues #117, #118, #119, #126, #129 resolved — top-5 issue batch)
> Previous updates: 2026-03-17 (issues #127, #128, #136, #142, #168 resolved)
> Previous updates: 2026-03-17 (issues #120–#125 resolved), 2026-03-17 (issues 168–169 added; #128, #151, #162 expanded — deep audit follow-up)
> Previous updates: 2026-03-17 (issues 162–167 added), 2026-03-17 (Post-Phase 13 critical analysis — issues 118–161 opened), Phase 9.5 (2026-03-15), Phase 10.8 (2026-03-15), exhaustive audit (2026-03-06)

## Summary
| Severity | Open | Closed |
|----------|------|--------|
| 🔴 High   | 0    | 15     |
| 🟡 Medium | 0    | 76     |
| 🟢 Low    | 0    | 78     |
| **Total** | **0** | **169** |

## Severity Legend
- 🔴 **High** — Can cause real bugs in production/CI, or actively misleading
- 🟡 **Medium** — Correctness/robustness improvement
- 🟢 **Low** — Maintainability, DX, or polish

---

## Open Issues

### ✅ ~~117. Table sort has no adapter override mechanism~~ — RESOLVED
- **File:** `src/elements/table.ts` (`sort` method)
- **Severity:** ~~Low~~ — resolved
- **Description:** The `sort()` method on `TableElement` clicked column headers directly with no override mechanism for component libraries with non-standard sort triggers.
- **Resolution:** Added optional `sort(tableLocator, column, headerIndex, headerLocator, options)` method to the `TableAdapter` interface. `table.sort()` now delegates to `adapter.sort()` when provided, falling back to the default "click the `<th>`" behaviour. Libraries like MUI (`<TableSortLabel>`), Vuetify, and Angular Material (`matSort`) can now inject custom sort logic without forking the framework.

---

### ✅ ~~118. Two interaction systems that don't compose~~ — RESOLVED
- **Scope:** Architecture (framework-wide)
- **Severity:** ~~High~~ — resolved (design decision documented)
- **Description:** The handler registry (`group.write("Label", value)` auto-detection) and typed wrappers (`checkbox().check()`, `select().choose()`) are parallel code paths.
- **Resolution:** Documented as permanent design decision AD-1 in `framework/README.md` § Architecture Decisions. The two paths serve different purposes: the handler registry provides auto-detection and generic write/read; typed wrappers provide rich domain-specific APIs (`sort()`, `increment()`, `close()`). Merging them would force every typed wrapper through the handler registry for operations with no `set(el, value)` analogue. README now includes explicit guidance table on when to use each path.

### ✅ ~~119. Select/combobox is three overlapping implementations~~ — RESOLVED
- **Scope:** `src/default-handlers.ts`, `src/elements/select-adapter.ts`, `src/adapters/generic-select-adapter.ts`, `src/adapters/editable-select-adapter.ts` (new)
- **Severity:** ~~High~~ — resolved
- **Description:** `comboboxSet` had inline logic for editable, hybrid, and non-editable combobox paths. The editable fill+option-click path was 40+ lines of inline code duplicating strategies already in the adapter layer.
- **Resolution:** Created `editableSelectAdapter` implementing `SelectAdapter` in `src/adapters/editable-select-adapter.ts`. Extracted the fill+option-click logic (clear → fill → aria-controls lookup → nearby listbox → page-level fallback). `comboboxSet` is now a thin dispatcher: detect editable/hybrid/non-editable → delegate to the appropriate adapter. `comboboxGet` similarly delegates to `editableSelectAdapter.read()` or `genericNonEditableSelectAdapter.read()`. New adapter exported from public API. All 1064 tests pass.

### ✅ ~~120. `checkboxgroupGet` lowercases labels — lossy round-trip (Issue 9 was a false fix)~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L289)
- **Severity:** ~~High~~ — resolved
- **Description:** `checkboxgroupGet` was lowercasing all labels via `.toLowerCase()`, producing `["apple", "banana"]` when actual labels were `"Apple"`, `"Banana"`. Every other handler preserved original casing.
- **Resolution:** Removed `.toLowerCase()` from `checkboxgroupGet`. Labels now preserve original casing. Case-insensitive comparison in `checkboxgroupSet` remains correct. Also removed dead `count` variable (bonus fix for #139).

### ✅ ~~121. `checkboxgroupSet` has no `force: true` fallback~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L274)
- **Severity:** ~~High~~ — resolved
- **Description:** `cb.check()` / `cb.uncheck()` were called without the force-click fallback that the single-checkbox handler (`toggleSet`) uses. Shadow DOM checkbox components that overlay the native input would fail.
- **Resolution:** Applied the same try-then-fallback pattern from `toggleSet`: first attempts with short timeout, catches retryable errors, falls back to `force: true`.

### ✅ ~~122. `generic-select-adapter` uses `startsWith` matching — false positive risk~~ — RESOLVED
- **File:** `src/adapters/generic-select-adapter.ts` (~L156)
- **Severity:** ~~High~~ — resolved
- **Description:** `text.startsWith(value)` meant searching for `"Cat"` would match `"Category"`. Changed to exact match.
- **Resolution:** Changed `text === value || text.startsWith(value)` to `text === value` in Strategy 4 CSS selector fallback.

### ✅ ~~123. `select().options()` hardcodes native `<option>` — broken with custom adapters~~ — RESOLVED
- **File:** `src/elements/select.ts` (~L65)
- **Severity:** ~~High~~ — resolved
- **Description:** `el.locator("option")` only worked for native `<select>`. With any custom `SelectAdapter`, `options()` returned nothing.
- **Resolution:** Added optional `options()` method to `SelectAdapter` interface. `select().options()` now delegates to `adapter.options()` when available, with fallback to native `<option>` locator. Implemented `options()` on both `nativeSelectAdapter` and `genericNonEditableSelectAdapter`.

### ✅ ~~124. All date picker adapters assume en-US locale~~ — RESOLVED
- **Files:** `src/adapters/flatpickr.ts`, `src/adapters/mat-datepicker.ts`, `src/adapters/vue-datepicker.ts`
- **Severity:** ~~High~~ — resolved
- **Description:** All three hardcoded `toLocaleDateString("en-US")` for aria-label matching. Non-English locales would cause month navigation to loop until max attempts.
- **Resolution:** Each adapter now has a factory function (`createFlatpickrAdapter(locale)`, `createMatDatePickerAdapter(locale)`, `createVueDatePickerAdapter(locale)`) that accepts a locale parameter (default `"en-US"`). The original constant exports remain as backward-compatible defaults. Also centralized mat-datepicker's magic `5_000` timeout to `DIALOG_CLOSE_TIMEOUT_MS` in `timeouts.ts`.

### ✅ ~~125. `vue-datepicker` adapter infinite loop on non-English month names~~ — RESOLVED
- **File:** `src/adapters/vue-datepicker.ts` (~L56)
- **Severity:** ~~High~~ — resolved
- **Description:** `Date.parse(displayedMonth + " 1, 2000")` on a non-English month name returned `NaN`, causing `getMonth()` to return `NaN` and the direction calc to always click "Next month" endlessly.
- **Resolution:** Replaced `Date.parse`-based month parsing with a pre-built locale-aware month name map (`buildMonthMap(locale)`). Invalid/unrecognized months now fall back to clicking Next instead of looping infinitely.

### ✅ ~~126. Adapter pattern inconsistently applied~~ — RESOLVED
- **Scope:** Architecture (framework-wide)
- **Severity:** ~~Medium~~ — resolved (design decision documented)
- **Description:** DatePicker has a clean adapter. Select got one retroactively. Checkbox, radio, dialog close, stepper, and toast embed library-specific logic inline.
- **Resolution:** Documented as design decision AD-2 in `framework/README.md` § Architecture Decisions. The README now includes a table of all elements with formal adapter interfaces (Select, DatePicker, Table) and a table of elements with inline fallback strategies (Checkbox/Radio, Dialog, Toast) with explicit criteria for when each would need a formal adapter. The current inline strategies work across all 7 test apps; formal adapters will be created when concrete failures are observed with new component libraries.

### ✅ ~~127. `dialog.title()` scopes `aria-labelledby` lookup to dialog only~~ — RESOLVED
- **File:** `src/elements/dialog.ts` (~L179)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `el.locator('#${id}')` searched within the dialog element. But `aria-labelledby` can reference elements anywhere in the document. If the referenced element was outside the dialog (common with portaled content), `title()` returned `""`.
- **Resolution:** Changed `el.locator(...)` to `el.page().locator(...)` in the aria-labelledby fallback, allowing page-global ID resolution.

### ✅ ~~128. `dialog.close()` silently swallows failures + magic `5_000` timeout~~ — RESOLVED
- **File:** `src/elements/dialog.ts` (~L122–L126)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `.catch(() => {})` swallowed the `waitFor(hidden)` timeout. If Escape/close-button didn't work, the test continued with the dialog still open. No error, no warning. The `5_000` ms timeout was a magic number not sourced from `timeouts.ts`.
- **Resolution:** Replaced magic `5_000` with `DIALOG_CLOSE_TIMEOUT_MS` from `timeouts.ts`. Added `ctx.logger.getLogger().warn(...)` in the catch block to emit a warning when the dialog doesn't become hidden within the timeout. Callers can still check `isOpen()` to detect the still-open dialog.

### ✅ ~~129. `comboboxSet` embeds Vuetify-specific XPath in generic handler~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L101)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `el.locator("xpath=ancestor::*[contains(@class,'v-field') or @role='combobox'][1]")` contained the Vuetify-specific `.v-field` class in a supposedly generic handler.
- **Resolution:** Replaced with `el.locator("xpath=ancestor::*[@role='combobox'][1]")` — uses only the standard ARIA `role="combobox"` attribute. The hybrid input path now delegates to `genericNonEditableSelectAdapter` with the ancestor combobox element, eliminating the inline retry loop as well. Done as part of the #119 refactoring.

### ✅ ~~130. `generic-select-adapter` has Shoelace-specific tag in "generic" code~~ — RESOLVED
- **File:** `src/adapters/generic-select-adapter.ts` (~L141)
- **Severity:** ~~Medium~~ — resolved
- **Description:** Strategy 4 hardcoded `'sl-option'` as a CSS selector. Other web component libraries (`fast-option`, `md-option`) were not covered.
- **Resolution:** Replaced `'sl-option'` with `'[part="option"]'` in Strategy 4 CSS selector fallback. The cascade is now `['[role="option"]', '[part="option"]']` — both are generic, standards-based selectors that work across component libraries. Also updated the comment to remove Shoelace-specific language.

### ✅ ~~131. `generic-select-adapter` page-global option visibility check~~ — RESOLVED
- **File:** `src/adapters/generic-select-adapter.ts` (~L71-74)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `page.locator('[role="option"]').first().isVisible()` checked page-globally. If another combobox's dropdown was open, this returned `true` for the wrong element.
- **Resolution:** The visibility check now reads `aria-controls`/`aria-owns` from the combobox locator and scopes the option visibility query to the referenced listbox element. Falls back to page-global `[role="option"]` only when no ARIA relationship is specified. Also fixed the `.catch(() => {})` on the close-and-retry click to use `isRetryableInteractionError`.

### ✅ ~~132. `normalizeRadioLabel` silently strips content after em/en dashes~~ — RESOLVED
- **File:** `src/label-resolution.ts` (~L18-21)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `"Express — $9.99"` → `"Express"`. If a label legitimately used em-dash-separated content, prefix was silently dropped. No opt-out, no logging.
- **Resolution:** Expanded JSDoc to comprehensively document the dash-stripping behavior with examples, the rationale (shipping/pricing labels), the explicit exclusion of regular hyphens, and a workaround for applications that use em/en dashes as meaningful content (`aria-label` on the input element). The behavior is intentional and consistent across all 7 test apps.

### ✅ ~~133. Middleware pipeline `as Promise<T>` erases type corruption in production~~ — RESOLVED
- **File:** `src/middleware-pipeline.ts` (~L179)
- **Severity:** ~~Medium~~ — resolved
- **Description:** A middleware that returned the wrong type silently corrupted the return value. The debug-mode guard caught this, but debug mode was opt-in.
- **Resolution:** Type-corruption detection now runs unconditionally (not just in debug mode). The `actionResultRef` is always captured. In debug mode, type mismatches throw an error (existing behavior). In non-debug mode, type mismatches emit `console.warn` instead of silently corrupting the value. The check is cheap (two `typeof` comparisons + optional constructor name comparison) so there is no measurable performance impact.

### ✅ ~~134. `clickInContainer` is O(N) sequential unlike `resolveOnce`~~ — RESOLVED
- **File:** `src/dom-helpers.ts` (~L105-135)
- **Severity:** ~~Medium~~ — resolved
- **Description:** Role cascade (button → link → menuitem → tab → ...) did sequential `count()` calls. `resolveOnce` in `label-resolution.ts` batched all counts in `Promise.all`. This path didn't.
- **Resolution:** Refactored to build all 7 role locators upfront and batch their `count()` calls in a single `Promise.all`. The first role with a non-zero count is clicked. Falls back to `getByText()` if no role matches. Reduces wall-clock latency from 7 sequential round-trips to 1 parallel batch.

### ✅ ~~135. `table.rows()` is O(N) sequential locator calls~~ — RESOLVED
- **File:** `src/elements/table.ts` (~L230-241)
- **Severity:** ~~Medium~~ — resolved
- **Description:** Each row iterated `allTextContents()` sequentially. For a table with N rows, this was N sequential browser round-trips.
- **Resolution:** Refactored `rows()` to batch all `allTextContents()` calls in a single `Promise.all()`. All N rows' cell texts are now fetched in parallel, reducing wall-clock latency from N sequential round-trips to 1 parallel batch.

### ✅ ~~136. `stepper.read()` truncates decimal values~~ — RESOLVED
- **File:** `src/elements/stepper.ts` (~L73)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `parseInt(value, 10)` truncated decimals. A stepper with `step="0.5"` showing `"3.5"` read as `3`. Return type was `Promise<number>` with no mention of integer-only constraint.
- **Resolution:** Replaced `parseInt(value, 10)` with `Number(value)` to preserve decimal precision. Updated error message from "not a valid integer" to "not a valid number". Relaxed `stepper.set()` validation to accept non-integer finite numbers.

### ✅ ~~137. Network settle middleware race condition~~ — RESOLVED
- **File:** `src/network-settle-middleware.ts` (~L241-245)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `signalActionComplete()` fired synchronously after `next()` resolved. If the action triggered a `fetch()` whose `"request"` event hadn't fired yet, `pending.size === 0` was true and the idle timer started immediately.
- **Resolution:** Added `setTimeout(() => checkSettle(), 0)` deferral in `signalActionComplete()` so the first settle check runs after one event-loop turn, giving pending request events time to propagate before the idle timer starts.

### ✅ ~~138. `radio` handler `expectedValueType` is misleading~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L337)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `expectedValueType: ["string"]` but `radioSet` ignored the value parameter entirely (`_value`). `group.write("SomeRadio", "anything")` passed validation but the value was discarded.
- **Resolution:** Changed `expectedValueType` from `["string"]` to `["boolean"]` to match the actual behaviour (radio check is a boolean operation). Added JSDoc to `radioSet` documenting that the value is ignored and callers should use `radiogroupSet` for label-based selection.

### ✅ ~~139. Dead `count` variable in `checkboxgroupGet`~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L281)
- **Severity:** ~~Low~~ — resolved
- **Description:** `const count = (await nativeChecked.count()) + (await ariaChecked.count())` — computed but never referenced. The loop below recomputes both counts separately.
- **Resolution:** Removed as part of #120 fix.

### ✅ ~~140. Dead `NESTED_ACTION` symbol in `wrap-element.ts`~~ — RESOLVED
- **File:** `src/wrap-element.ts` (~L93-94)
- **Severity:** ~~Low~~ — resolved
- **Description:** Symbol was defined, voided, and never read. Existed solely as a "searchable anchor for design rationale."
- **Resolution:** Replaced the `NESTED_ACTION` symbol and its `void` suppression with a plain block comment documenting the nested-action design rationale. The comment includes the same information (AsyncLocalStorage guard, per-async-chain trade-off, forceMiddleware override) in a searchable format.

### ✅ ~~141. `nativeSelectAdapter.read()` uses dynamic import for circular dep avoidance~~ — RESOLVED
- **File:** `src/elements/select-adapter.ts` (~L58)
- **Severity:** ~~Low~~ — resolved
- **Description:** `await import("../dom-helpers.js")` on every `read()` call. Module loader caches it, but a top-level import would be cleaner.
- **Resolution:** Verified no circular dependency exists (`dom-helpers.ts` only imports from `@playwright/test` and `handler-types.ts`). Replaced dynamic `await import("../dom-helpers.js")` with a static top-level `import { readSelectedOptionText } from "../dom-helpers.js"`. All 1080 tests pass.

---

### ✅ ~~142. Vanilla app stock column sorting is broken~~ — RESOLVED
- **Scope:** `apps/vanilla-html/` (app bug)
- **Severity:** ~~High~~ — resolved
- **Description:** `data-sort-key="stock"` in `index.html` but the data property is `inStock` in `app.js`. Sorting by Stock column compared `undefined` values, producing no visible sort.
- **Resolution:** Changed `data-sort-key="stock"` to `data-sort-key="inStock"` in `index.html` to match the actual data property name.

### ✅ ~~143. Product data duplicated 7 times across apps~~ — RESOLVED
- **Scope:** `apps/*/` (all apps)
- **Severity:** ~~Medium~~ — resolved
- **Description:** `PRODUCTS`, `CATEGORIES`, `SHIPPING` arrays were copy-pasted into every app. Any data change required 7 coordinated edits.
- **Resolution:** Created `shared/data.ts` as the canonical single source of truth. All 6 bundled apps (react, vue, angular, svelte, nextjs, lit) now import from `@shared/data`. Vite apps use `resolve.alias` + `server.fs.allow`; Angular uses tsconfig `paths`; Next.js uses tsconfig `paths` + native monorepo support. Vanilla-html retains an inline copy (no bundler) with a comment pointing to the canonical source. 6 redundant `data.ts` files deleted. All 861 integration tests pass.

### ✅ ~~144. Business logic duplicated 7 times across apps~~ — RESOLVED
- **Scope:** `apps/*/` (all apps)
- **Severity:** ~~Low~~ — resolved
- **Description:** Filter composition (AND logic), sorting, toast timing (3s setTimeout) re-implemented identically in each app. One canonical JS module with per-framework UI bindings would reduce maintenance.
- **Resolution:** Created `shared/logic.ts` with canonical implementations of `filterProducts()`, `sortProducts()`, `filterAndSortProducts()`, `toggleSort()`, `cartMessage()`, `formatDate()`, plus `TOAST_DURATION_MS` constant and `SortKey`/`FilterCriteria`/`SortCriteria` types. All 7 apps updated to import from `@shared/logic`. Sort key standardized from 'stock' to 'inStock' across all apps to match the `Product.inStock` field name. All 924 integration tests pass (899 pass, 7 pre-existing failures in unrelated `functional-swap.spec.ts`, 18 skipped).

### ✅ ~~145. React app renders duplicate toast elements~~ — RESOLVED
- **Scope:** `apps/react-app/src/pages/Home.tsx`
- **Severity:** ~~Low~~ — resolved
- **Description:** Both MUI `<Snackbar>` AND inline `<div class="toast" role="status" aria-live="polite">` render with the same message. Two DOM elements, two screen reader announcements.
- **Resolution:** Removed the duplicate MUI `<Snackbar>`/`<Alert>` component, keeping only the inline toast div (which uses standard `role="status"` / `aria-live="polite"` attributes that the test framework relies on). Same fix also applied to Next.js (`HomeClient.tsx`) and Vue (`Home.vue`) apps which had the same duplication.

### ✅ ~~146. Lit app dead import removed~~ — PARTIALLY RESOLVED
- **Scope:** `apps/lit-app/src/general-store-home.ts`
- **Severity:** ~~Low~~ — partially resolved
- **Description:** All styles, state, handlers, and template in one class (~200 lines of styles alone). Every other app decomposed into sub-components. Also imports `@shoelace-style/shoelace/dist/components/dialog/dialog.js` which is never used (app uses custom `<general-store-dialog>`).
- **Resolution:** Removed the dead `@shoelace-style/shoelace/dist/components/dialog/dialog.js` import. The monolith decomposition is deferred — the file remains a single component but business logic was extracted to `shared/logic.ts` as part of #144. Further decomposition into sub-components is a separate concern.

---

### ✅ ~~147. `ui-contract.md` contradicts `REQUIREMENTS.md` in 4+ places~~ — RESOLVED
- **Scope:** `docs/REQUIREMENTS.md`
- **Severity:** ~~Medium~~ — resolved
- **Description:** `shared/ui-contract.md` was deleted. REQUIREMENTS.md §6 was updated to match what apps actually implement (sort headers, filter container, delayed content, validation roles). Single source of truth now.
- **Resolution:** File deleted; REQUIREMENTS.md §6 updated.

### ✅ ~~148. "Zero library-specific code paths" claim is false~~ — RESOLVED
- **Scope:** `docs/ROADMAP.md`, `docs/REVIEW_SYNTHESIS.md`
- **Severity:** ~~Medium~~ — resolved
- **Description:** ROADMAP.md claimed "No library-specific code paths — all adaptations use generic ARIA/role-based detection" despite 4 date picker adapters, checkbox `force: true` fallback, and ARIA fallback for Bits UI.
- **Resolution:** Updated ROADMAP.md Phase 10 checklist to "No library-specific code paths in the detection layer — library-specific logic is isolated in adapters". REQUIREMENTS.md §8 and framework README.md were already corrected in prior issue resolutions. Updated REVIEW_SYNTHESIS.md P2-13 to note the correction.

### ✅ ~~149. Root README test count excludes crawler tests~~ — RESOLVED
- **Scope:** `README.md`
- **Severity:** ~~Low~~ — resolved
- **Description:** Claims 919 tests. The crawler has 626+ tests. Actual total is ~1545+.
- **Resolution:** Updated root README to report 2,088 total tests (framework: 924 integration + 219 unit = 1,143; crawler: 868 integration + 77 unit = 945). Updated framework README with correct per-file and per-app counts (132 tests/app × 7 = 924 integration).

### ✅ ~~150. `start:all` script documented as working but consistently fails~~ — RESOLVED
- **Scope:** `package.json`, `README.md`
- **Severity:** ~~Low~~ — resolved
- **Description:** Terminal history shows repeated exit code 1 from `npm run start:all` and various `concurrently` invocations. The script lacks `--names` and `--prefix-colors` for debugging.
- **Resolution:** Per #165, the failures were caused by running from the wrong cwd (`framework/` instead of repo root). Added a troubleshooting note to root README explaining `start:all` must be run from the repo root. See also #164 (ROADMAP htmx reference fixed).

### ✅ ~~151. No `engines` field in any `package.json`~~ — RESOLVED
- **Scope:** All 9 `package.json` files (root + 7 apps + framework)
- **Severity:** ~~Low~~ — resolved
- **Description:** Project requires Node 20 (per `.nvmrc`) but none of the 9 `package.json` files enforce it. `npm install` succeeds on any Node version.
- **Resolution:** Added `"engines": { "node": ">=20" }` to all 9 `package.json` files (root, framework, vanilla-html, react-app, vue-app, angular-app, svelte-app, nextjs-app, lit-app).

---

### ✅ ~~152. Single-browser test coverage only (Chromium)~~ — RESOLVED
- **Scope:** `framework/playwright.config.ts`
- **Severity:** ~~Medium~~ — resolved
- **Description:** All 7 projects used `browserName: "chromium"`. No Firefox or WebKit.
- **Resolution:** Added Firefox and WebKit projects gated behind the `BROWSERS` env var. Default `npx playwright test` still runs Chromium only (861 tests). `BROWSERS=firefox,webkit npx playwright test` runs all 3 engines (2583 tests). Individual projects available via `--project=vanilla-firefox`. Browsers installed and smoke tested.

### ✅ ~~153. Major test coverage gaps~~ — RESOLVED
- **Scope:** `framework/tests/`
- **Severity:** ~~Medium~~ — resolved
- **Description:** Missing tests for stock/category column sorting, backdrop-click modal close, browser back/forward, date picker clear, stepper bound clamping, and category filter option enumeration.
- **Resolution:** Added 63 new integration tests (9 new test cases × 7 apps): sort by stock, sort by category, backdrop-click modal close, browser back, browser forward, stepper min clamping, stepper max clamping, date picker clear (skipped for vue/svelte library pickers), and category filter options. Total integration tests: 924 (898 pass + 17 skip + 9 pre-existing failures).

### ✅ ~~154. Date picker assertions use `toBeTruthy()` for 5/7 apps~~ — RESOLVED
- **Scope:** `framework/tests/group-order-controls.spec.ts`
- **Severity:** ~~Medium~~ — resolved
- **Description:** Date picker read assertions for 5 of 7 apps were `toBeTruthy()` instead of exact-value checks.
- **Resolution:** Replaced `toBeTruthy()` with exact format assertions for all 7 apps. vanilla/lit → `"2026-12-25"` (native ISO), react/nextjs/angular/svelte → `"12/25/2026"` (MM/DD/YYYY), vue → `toMatch(/^12\/25\/2026/)` (vue-datepicker appends time). All 861 integration tests pass.

### ✅ ~~155. Delayed content test has race condition~~ — RESOLVED
- **Scope:** `framework/tests/dynamic-content.spec.ts`
- **Severity:** ~~Medium~~ — resolved
- **Description:** "Initially shows loading message" asserted `not toHaveText("")` instead of the exact loading text. If the 1.5s timer fired before the assertion, the test saw final content and passed vacuously.
- **Resolution:** Changed assertion to `toHaveText("Loading recommendations…", { timeout: 500 })` — asserts the exact loading string (Unicode ellipsis, consistent across all 7 apps) with a 500ms timeout shorter than the 1.5s content delay, ensuring the test actually catches the loading state.

### ✅ ~~156. Toast page object selector won't pierce Lit shadow DOM~~ — RESOLVED
- **Scope:** `framework/tests/pages/home.ts` (~L41)
- **Severity:** ~~Low~~ — resolved (non-issue)
- **Description:** `toast(By.css(".toast[aria-live='polite']"), page)` — concern that Lit shadow DOM would block the selector.
- **Resolution:** Verified all 8 Lit toast tests pass (including `toast appears after add to cart` and `toast auto-dismisses after ~3 seconds`). Playwright's `page.locator()` already pierces open shadow roots by default (`css` engine uses shadow-piercing descendant combinators). No code change needed.

### ✅ ~~157. Page objects use Playwright-specific `:has-text()` pseudo-class~~ — RESOLVED
- **Scope:** `framework/tests/pages/home.ts` (~L38)
- **Severity:** ~~Low~~ — resolved
- **Description:** `:has-text('Recommendations')` is a Playwright extension, not standard CSS.
- **Resolution:** Replaced `.section:has-text('Recommendations') [aria-live='polite']` with `.section [aria-live='polite']` — a standard CSS selector that uniquely matches the delayed content element across all 7 apps (no other `.section` contains `[aria-live]`). All 35 dynamic content tests pass.

---

### ✅ ~~158. Crawler emits Playwright-specific selectors in manifests~~ — RESOLVED
- **Scope:** `tools/crawler/src/discover.ts`, `tools/crawler/src/emitter.ts`
- **Severity:** ~~Medium~~ — resolved
- **Description:** `:text-is()` pseudo-class appeared in generated selectors for fieldset disambiguation. Non-standard — manifests didn't work outside Playwright.
- **Resolution:** Changed `discover.ts` to emit standard CSS `[aria-label="..."]` attribute selectors instead of `:text-is()`. Updated `emitter.ts` to handle both the new format and legacy manifests (backward compatible). Updated emitter tests and README. All 41 crawler emitter tests + 14 crawl tests pass.

### ✅ ~~159. No manifest schema version field~~ — RESOLVED
- **Scope:** `tools/crawler/src/types.ts`, `tools/crawler/src/merge.ts`
- **Severity:** ~~Low~~ — resolved
- **Description:** `CrawlerManifest` had no `version` or `schemaVersion` field.
- **Resolution:** Added `schemaVersion: number` to the `CrawlerManifest` interface. `mergeManifest()` sets `schemaVersion: 1` on new manifests and preserves `existing.schemaVersion ?? 1` on merges (backward-compatible with pre-schema manifests). Test fixtures updated. All 812 crawler + 219 unit tests pass.

### ✅ ~~160. `isFrameworkId` regex misses Svelte patterns~~ — RESOLVED
- **Scope:** `tools/crawler/src/discover.ts` (~L257-259)
- **Severity:** ~~Low~~ — resolved
- **Description:** Regex catches React, Angular, Vue synthetic IDs but not Svelte's `svelte-1abc2de` pattern.
- **Resolution:** Added `|^svelte-[a-z0-9]+$` to the `isFrameworkId` regex. Svelte-generated IDs (e.g., `svelte-1abc2de`) are now correctly identified as framework-generated and excluded from label resolution.

### ✅ ~~161. Shadow DOM discovery is O(n²)~~ — RESOLVED
- **Scope:** `tools/crawler/src/discover.ts` (~L113-126)
- **Severity:** ~~Low~~ — resolved
- **Description:** `querySelectorAllDeep` used recursive descent, which caused O(n²) overhead on deeply nested shadow DOM trees.
- **Resolution:** Replaced recursive implementation with an iterative work queue (`const queue: ParentNode[] = [root]`). Each shadow root is enqueued and processed in a flat `while` loop, eliminating call-stack growth and array spread overhead from deep recursion. All 812 crawler tests pass.

---

### ✅ ~~162. Promise-chain `.catch(() => {})` silently swallows all errors in generic-select-adapter and mat-datepicker~~ — RESOLVED
- **Files:** `src/adapters/generic-select-adapter.ts` (~L71), `src/adapters/mat-datepicker.ts` (~L88)
- **Severity:** ~~Medium~~ — resolved
- **Description:** Promise-chain `.catch(() => {})` silently swallowed all errors including non-retryable ones.
- **Resolution:** `generic-select-adapter.ts` was already fixed in issue #131 — all catches now use `isRetryableInteractionError`. `mat-datepicker.ts` overlay close catch replaced with `.catch((e) => { if (!isRetryableInteractionError(e)) throw e; })`, with `isRetryableInteractionError` import added.

### ✅ ~~163. Test count arithmetic doesn't reconcile across docs~~ — RESOLVED
- **Scope:** `README.md`, `framework/README.md`, `docs/REVIEW_SYNTHESIS.md`, `framework/PLAN.md`
- **Severity:** ~~Medium~~ — resolved
- **Description:** Multiple documents had contradictory test counts (1040, 919, 700, 821). None matched the actual `playwright test --list` output.
- **Resolution:** Ran `playwright test --list` to get authoritative counts: 861 integration (123/app × 7 apps, 16 spec files) + 219 unit (15 files) = 1080 framework tests. Updated all four documents (root README, framework README, REVIEW_SYNTHESIS.md, PLAN.md) with consistent numbers. Framework README compatibility table updated from 100→123 per app, total 700→861. File tree listing updated to include `functional-swap.spec.ts (16 tests)`. Also resolves #167 (PLAN.md stale header count).

### ✅ ~~164. ROADMAP Phase 0 `start:all` example still includes `htmx-app`~~ — RESOLVED
- **Scope:** `docs/ROADMAP.md` (Phase 0 section)
- **Severity:** ~~Low~~ — resolved
- **Description:** The `start:all` script example in Phase 0 references `"npm start --prefix apps/htmx-app"` but HTMX was deferred from v0.1. The actual `package.json` is correct (no htmx). The example is a copy-paste artifact.
- **Resolution:** Removed `htmx-app` from the Phase 0 script example in ROADMAP.md and updated the app count from 8 to 7.

### ✅ ~~165. Issue #150 misdiagnoses `start:all` as broken~~ — RESOLVED
- **Scope:** Issue #150 in this file
- **Severity:** ~~Low~~ — resolved
- **Description:** Issue #150 says "`start:all` script documented as working but consistently fails." Terminal history shows repeated exit code 1, but all failures occurred when run from `framework/` subdirectory (where no `start:all` script exists). Running `npm run start:all` from repo root works correctly. The issue's root cause is wrong cwd, not a broken script.
- **Resolution:** Resolved #150 with the correct root cause (wrong cwd). Added troubleshooting note to root README. See #150 resolution.

### ✅ ~~166. REVIEW_SYNTHESIS.md is stale — scores don't reflect current state~~ — RESOLVED
- **Scope:** `docs/REVIEW_SYNTHESIS.md`
- **Severity:** ~~Medium~~ — resolved
- **Description:** Scores the project 5.4/10 with 15 critical issues. The scorecard, priority matrix, and risk assessment were all outdated.
- **Resolution:** Added a prominent SUPERSEDED banner at the top of REVIEW_SYNTHESIS.md listing all post-review work (P0 fixes, Phases 11–13, networkSettleMiddleware, editableSelectAdapter, 48+ unit tests, 154+ issues tracked), with links to current status documents. Original content preserved as historical artifact.

### ✅ ~~167. PLAN.md header status line has stale unit test count~~ — RESOLVED
- **Scope:** `framework/PLAN.md` (line 3)
- **Severity:** ~~Low~~ — resolved
- **Description:** Status line said `Complete — 700/700 integration tests + 171 unit tests pass` but the unit count grew to 219 in Phase 10.8.
- **Resolution:** Fixed as part of #163 — PLAN.md header now reads `861/861 integration tests + 219 unit tests`.
- **Recommended fix:** Change header to `Complete — 700/700 integration tests + 219 unit tests pass`.

### ✅ ~~168. `comboboxSet` / `comboboxGet` make duplicate `evaluate()` calls per invocation~~ — RESOLVED
- **File:** `src/default-handlers.ts` (~L79–80, ~L196–197)
- **Severity:** ~~Medium~~ — resolved
- **Description:** Both `comboboxSet` and `comboboxGet` performed two separate `evaluate()` calls back-to-back: one to get `tagName` and another to check `readOnly`. Each was a full browser round-trip.
- **Resolution:** Merged both `evaluate()` calls into a single call returning `{ tagName, readOnly }` in both `comboboxSet` and `comboboxGet`. Eliminates 2 unnecessary browser round-trips per combobox interaction.

### ✅ ~~169. `functional-swap.spec.ts` has 2 unconditional `test.skip()` with no explanation~~ — RESOLVED
- **File:** `tests/functional-swap.spec.ts` (~L343, ~L372)
- **Severity:** ~~Low~~ — resolved
- **Description:** Two tests called `test.skip()` unconditionally with no reason string.
- **Resolution:** Added descriptive reason strings: dialog test skips with `"dialog is portaled outside the crawled DOM in non-vanilla frameworks"`, toast test skips with `"toast element is not discoverable by the crawler in non-vanilla frameworks"`. All 898 integration tests pass (18 skipped with documented reasons).

---

## Closed Issues

### � 113. `comboboxSet` assumes editable text input — will break all component library selects
- **File:** `src/default-handlers.ts` (line 61–97)
- **Closed:** 2026-03-15 (Phase 9.5.1) — `comboboxSet` now detects editable vs non-editable combobox elements via `tagName` check. Editable (`<input>`, `<textarea>`) uses the existing `fill()` path. Non-editable (`<div>`, `<button>`, etc.) delegates to `genericNonEditableSelectAdapter` which clicks the trigger, finds the matching option, and clicks it. Added matching `comboboxGet` with the same detection. All 700 integration + 171 unit tests pass.

### 🟡 114. No `SelectAdapter` / `ComboboxAdapter` interface exists
- **File:** `src/elements/select-adapter.ts` (new)
- **Closed:** 2026-03-15 (Phase 9.5.1) — Created `src/elements/select-adapter.ts` with `SelectAdapter` interface, `nativeSelectAdapter` (wraps `selectOption()`/`readSelectedOptionText()`), and `genericNonEditableSelectAdapter` (click-to-open + option click). Wired into `select()` element via `SelectOptions.adapter` option (same pattern as `DatePickerAdapter`). Exported from public API. Library-specific adapters (MUI, Vuetify, etc.) will be created in Phase 10 as needed.

### 🟡 115. `clickInContainer` role cascade is too narrow
- **File:** `src/dom-helpers.ts`
- **Closed:** 2026-03-15 (Phase 9.5.2) — Expanded `clickInContainer` cascade from `button → link → text` to `button → link → menuitem → tab → menuitemcheckbox → menuitemradio → option → text`. All 700 integration tests pass with no regressions.

### 🟡 116. Shoelace shadow DOM may defeat `requireChild` detection for groups
- **File:** `src/element-classifier.ts` (Phase 2 child detection)
- **Documented:** 2026-03-15 (Phase 9.5.3) — Added detailed comment block in `src/element-classifier.ts` near `classifyElement` documenting the nested shadow root risk and expected fix path (tag-name-based detect rules via `createHandler`). Added warning callout in ROADMAP.md Phase 10.6 checklist. No code fix needed yet — will be resolved during Phase 10.6 Shoelace migration.

### �🟢 110. `coercion.spec.ts` and `click-in-container.spec.ts` import from `@playwright/test` instead of `test-fixture.js`
- **Files:** `tests/unit/coercion.spec.ts` (line 1), `tests/unit/click-in-container.spec.ts` (line 1)
- **Closed:** 2026-03-06 — Changed both imports from `@playwright/test` to `../../src/test-fixture.js`, matching the project convention established by Issue 42. All 261 tests pass.

### 🟢 111. Error classification via message-string matching is fragile
- **Files:** `src/label-resolution.ts`, `src/elements/table.ts`
- **Closed:** 2026-03-06 — Created `src/playwright-errors.ts` with centralised `isDetachedError(err)` and `isTimeoutError(err)` utilities. `isTimeoutError` uses `instanceof errors.TimeoutError` as the primary check with message-string fallback. Updated `resolveAttempt()` in `label-resolution.ts` and `isEmpty()` in `table.ts` to use the new helpers. All 261 tests pass.

### 🟢 112. No test for custom `DatePickerAdapter` injection
- **Files:** `tests/unit/date-picker-adapter.spec.ts` (new)
- **Closed:** 2026-03-06 — Added 4 unit tests: `select()` delegates to custom adapter with correct arguments, `read()` delegates and returns adapter's value, adapter receives a real Playwright locator (verified via `evaluate()`), default native adapter is used when no custom adapter is provided. All 261 tests pass.

### 🟡 107. `stepper.set()` "click" strategy has no post-loop value verification
- **File:** `src/elements/stepper.ts` (`set` method)
- **Closed:** 2026-03-04 — Added a post-loop `wrapped.read()` check after the click loop. If the actual value differs from the target, throws a descriptive error including the target, actual value, click count, and direction. All 257 tests pass.

### 🟢 108. `get handlers()` getter exposes unfrozen custom-registered handler objects
- **File:** `src/handler-registry.ts` (`registerHandler`)
- **Closed:** 2026-03-04 — Added `Object.freeze()` to each cloned detect rule, the detect array, and the cloned handler object inside `registerHandler()`, matching the freeze depth applied to `DEFAULT_HANDLERS`. Runtime mutation of registered handlers now throws in strict mode.

### 🟢 109. `createHandler()` shallow rule clone still shares nested arrays with `DEFAULT_HANDLERS`
- **File:** `src/default-handlers.ts` (`createHandler`)
- **Closed:** 2026-03-04 — Applied the same array-spread deep-clone pattern used in `registerHandler()`: `tags`, `roles`, `inputTypes`, and `attr` arrays are now individually spread in the rule clone, breaking shared references with the frozen `DEFAULT_HANDLERS`.

### 🟢 63. No integration test for `tableRow.refresh()`
- **File:** `tests/table-row-refresh.spec.ts`
- **Closed:** 2026-03-04 — Added 3 integration tests: refresh after sorting verifies cell values persist, refresh after filtering verifies row data, refresh throws when row no longer matches after filter change.

### 🟢 64. No test for `group.readTyped()`
- **File:** `tests/read-typed.spec.ts`
- **Closed:** 2026-03-04 — Added 4 integration tests: readTyped("string") for text input, readTyped("boolean") for checkbox, TypeError on kind mismatch (checkbox as "string"), readTyped("string") for select dropdown.

### 🟢 65. No test for `stepper.set()` with `strategy: "fill"`
- **File:** `tests/group-order-controls.spec.ts`
- **Closed:** 2026-03-04 — Added 2 integration tests: fill strategy bypasses click loop and reads back correct value, fill then increment via click verifies combined behavior. Tests remove `readonly` attribute before filling.

### 🟢 69. No unit test for `setStrictContextMode()` and `resetWarningState()`
- **File:** `tests/unit/strict-context.spec.ts`
- **Closed:** 2026-03-04 — Added 7 unit tests covering strict-mode throws from getActiveContext() and checkMutationScope() outside scope, success inside runWithContext(), non-strict fallback with console.error warning, warning deduplication per operation, and resetWarningState() causing warnings to re-fire.

### 🟢 73. No unit test for `wrapElement` action-name typo detection
- **File:** `tests/unit/middleware.spec.ts`
- **Closed:** 2026-03-04 — Added 3 unit tests: typo "clcik" throws descriptive error, error message lists available methods, valid action names pass without error.

### 🟢 74. No unit test for `useMiddleware` duplicate registration error
- **File:** `tests/unit/middleware.spec.ts`
- **Closed:** 2026-03-04 — Added unit test verifying that registering the same middleware function twice throws `/already registered/`.

### 🟢 79. No integration test for `textInput.clear()`
- **File:** `tests/override-escape.spec.ts`
- **Closed:** 2026-03-04 — Added integration test: fill → clear → verify read returns empty string.

### 🟢 80. No integration test for `By.shadow()` against live DOM
- **File:** `tests/by-strategies.spec.ts`
- **Closed:** 2026-03-04 — Added integration test using inline HTML with Shadow DOM host and `attachShadow()`. Verifies `By.shadow()` resolves and the element is visible with correct text.

### 🟢 81. `group.read()` doesn't validate returned value type — inconsistent with `readAll()`
- **File:** `src/elements/group.ts`
- **Closed:** 2026-03-04 — Added `validateReturnedValue()` guard to `group.read()` when handler declares `valueKind`, matching the existing validation in `readAll()`.

### 🟢 82. `overrideHandler()` doesn't validate `HandlerActions` object at runtime
- **File:** `src/elements/group-override.ts`
- **Closed:** 2026-03-04 — Added runtime guards checking `handler.get` and `handler.set` are functions before storing the override. Throws descriptive error with label name on mismatch.

### 🟢 83. `_warnedAboutDefaultFallback` is dead code in `context.ts`
- **File:** `src/context.ts`
- **Closed:** 2026-03-04 — Deleted the `_warnedAboutDefaultFallback` variable declaration and its reset in `resetWarningState()`. The associated explanatory JSDoc comment was also removed.

### 🟢 84. No test for `BaseElement.withTimeout()`
- **File:** `tests/button-output-toast.spec.ts`
- **Closed:** 2026-03-04 — Added integration test: `withTimeout(500)` on button element, verifies the rebuilt element reads back "Add to Cart".

### 🟢 85. `normalizeRadioLabel` JSDoc says "hyphen" but regex only matches em/en dashes
- **File:** `src/label-resolution.ts`
- **Closed:** 2026-03-04 — Updated JSDoc to say "em dash or en dash" and added note explaining why regular hyphens are intentionally excluded.

### 🟢 86. `table.emptyText()` doesn't guard against missing empty-state element
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Added count guard that throws `ElementNotFoundError` with descriptive message when no empty-state element exists. Added integration test verifying the error on a non-empty table.

### 🟢 90. No integration test for `group.click()`
- **File:** `tests/button-output-toast.spec.ts`
- **Closed:** 2026-03-04 — Added integration test: `home.click("Add to Cart")` via root group, verifies toast contains "Wireless Mouse".

### 🟢 96. Dangling duplicate JSDoc comment before `scanRowsLocator` in `table.ts`
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Deleted the first (shorter) orphaned JSDoc block, keeping only the comprehensive one with "Matching semantics" documentation.

### 🟢 97. `table.rows()` double-waits on header cells before calling `readHeaders()`
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Removed the redundant `waitFor` call in `rows()`, relying on `readHeaders()` for the header wait.

### 🟢 98. `createHandler()` shares detect rules by reference with default handlers
- **File:** `src/default-handlers.ts`
- **Closed:** 2026-03-04 — Added `.map(r => ({ ...r }))` clone to break the shared reference. Updated existing test assertion from `toBe` to `toEqual` to match the new clone semantics.

### 🟢 101. `By.any()` and `By.first()` accept zero arguments at compile time
- **File:** `src/by.ts`
- **Closed:** 2026-03-04 — Changed rest parameter type from `By[]` to `[By, ...By[]]` tuple, enforcing at least one argument at compile time. Removed now-unreachable runtime length guards.

### 🟢 102. `textInput` unused import in `tests/pages/home.ts`
- **File:** `tests/pages/home.ts`
- **Closed:** 2026-03-04 — Removed `textInput` from the import statement.

### 🟢 103. `By.first()` JSDoc has misaligned comment indentation
- **File:** `src/by.ts`
- **Closed:** 2026-03-04 — Aligned the two misindented `*` lines from 2-space to 3-space indent, matching the rest of the file.

### 🟢 104. `applyNormalize()` is a vestigial one-line wrapper after Issue 46
- **File:** `src/label-resolution.ts`
- **Closed:** 2026-03-04 — Deleted `applyNormalize()` function and replaced all three call sites in `resolveInputLabel` with direct `normalizeRadioLabel()` calls.

### 🟢 105. `group.write()` / `group.read()` / `group.readTyped()` don't validate empty/whitespace `label`
- **File:** `src/label-resolution.ts`
- **Closed:** 2026-03-04 — Added `if (!label.trim()) throw new Error("resolveLabeled: label must be a non-empty string")` guard at the top of `resolveLabeled()`, covering all callers.

### 🟢 106. `buildGroupElement` has an unreachable default parameter `fwCtx = getActiveContext()`
- **File:** `src/elements/group.ts`, `src/elements/group-types.ts`
- **Closed:** 2026-03-04 — Made `fwCtx` and `handlerOverrides` required parameters (no defaults) in `buildGroupElement`. Updated `BuildGroupParams` tuple type in `group-types.ts` to match.

### 🟢 16. `MiddlewarePosition` uses function references, not names
- **File:** `src/middleware-types.ts`
- **Closed:** 2026-03-04 — Converted `Middleware` from type alias to interface with optional `displayName` property. Extended `MiddlewarePosition` `before`/`after` variants to accept `Middleware | string`. Updated `MiddlewarePipeline` to resolve references by `displayName` when a string is passed.

### 🟢 17. `interaction.ts` is misnamed
- **File:** `src/interaction.ts` → `src/dom-helpers.ts`
- **Closed:** 2026-03-04 — Renamed `interaction.ts` to `dom-helpers.ts`. Updated all four import sites (`default-handlers.ts`, `elements/group.ts`, `elements/table.ts`, `elements/select.ts`). Updated module-level JSDoc.

### 🟢 18. `BuildGroupFn` manually synced with `buildGroupElement`
- **File:** `src/elements/group-types.ts`, `src/elements/group.ts`
- **Closed:** 2026-03-04 — Extracted `BuildGroupParams` named tuple type in `group-types.ts`. `BuildGroupFn` is now `(...args: BuildGroupParams) => GroupElement`. Added compile-time assertion `const _assertBuildGroupFn: BuildGroupFn = buildGroupElement` in `group.ts` — TypeScript will error if signatures drift.

### 🟢 19. `stepper.set()` and `checkbox.read()` rely on `this` in object literal
- **File:** `src/elements/stepper.ts`, `src/elements/checkbox.ts`
- **Closed:** 2026-03-04 — Replaced `this.read()` / `this.isChecked()` / `this.increment()` / `this.decrement()` calls with closure variable `wrapped` (captured from `wrapElement` return). Destructuring (`const { set } = el`) now works safely.

### 🟢 20. `resolveOnce` inconsistent `.first()` usage
- **File:** `src/label-resolution.ts`
- **Closed:** 2026-03-04 — Changed `resolveOnce` to always return `.first()` regardless of count, ensuring consistent locator string representations in error messages.

### 🟢 21. `dialog.close()` `pickLastOrOnly` picks last without documented rationale
- **File:** `src/elements/dialog.ts`
- **Closed:** 2026-03-04 — Added detailed JSDoc comment to `pickLastOrOnly` explaining the "pick last" rationale: dialogs render close buttons at the end of the container; last-in-DOM-order is the primary dismiss affordance; also works correctly with stacked dialogs.

### 🟢 24. `table.rowCount()` redundant empty-state check
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Removed the redundant `emptyState` count check from `rowCount()`. The `dataRows` selector already excludes `.empty-state` rows. Added documentation to `TableAdapter.dataRows` requiring custom adapters to exclude non-data rows in their selector.

### 🟢 25. `checkMutationScope` only guards the flat API
- **File:** `src/defaults.ts`, `src/extend.ts`
- **Closed:** 2026-03-04 — Added "Pitfalls for extension authors" documentation to both `extend.ts` (module-level JSDoc) and `defaults.ts` (module-level JSDoc) explaining that direct collaborator access bypasses the mutation-scope guard. Recommends using the flat convenience functions or `createFrameworkContext()` for isolation.

### 🟢 26. No unit test for `retryUntil` duck-typing edge case
- **File:** `tests/unit/` (was missing)
- **Closed:** 2026-03-04 — Resolved by Issue 2's fix: the legacy exception-based overload was deleted entirely. `retryUntil` now only accepts `RetryResult<T>`, eliminating the duck-typing ambiguity. The broader unit-test concern is tracked in Issue 68 (which added 10 tests). No further action needed.

### 🟢 35. No unit test for `registerHandler` validation rules
- **File:** `tests/unit/handlers.spec.ts`
- **Closed:** 2026-03-04 — Added 7 test cases: duplicate type name, empty detect rules, inputTypes without `tags: ["input"]`, missing primary criterion, non-function `set`, non-function `get`, and defensive-clone isolation. All 7 pass.

### 🟡 55. `dialog.isOpen()` framework-dialog path ignores `timeout` parameter
- **File:** `src/elements/dialog.ts` (`isOpen`, last line)
- **Closed:** 2026-03-04 — Changed `return el.isVisible()` to `return el.isVisible({ timeout })` in the framework-dialog branch, matching the native `<dialog>` branch and `BaseElement.isVisible()` semantics.

### 🟡 61. `createTableRowElement` doesn't provide a `byDescriptor`
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Added `byDescriptor: \`tableRow(${JSON.stringify(criteria)})\`` to the `buildElementFromProvider` call in `createTableRowElement`. Middleware `ActionContext.by` now carries a human-readable descriptor for all table row actions.

### 🟢 68. No unit test for `retryUntil()` — entire function untested
- **File:** `tests/unit/retry.spec.ts` (new)
- **Closed:** 2026-03-04 — Added 10 unit tests covering: immediate success, transient-then-success, non-retryable immediate throw, non-retryable after transient, timeout budget enforcement, thrown exceptions as retryable, progressive interval schedule, last-interval repetition, success before deadline, and non-retryable vs lastError precedence.

### 🟡 72. `registerHandler` defensive clone misses `attr` tuple and `expectedValueType` array
- **File:** `src/handler-registry.ts`
- **Closed:** 2026-03-04 — Added `attr: rule.attr ? [...rule.attr] as [string, string] : undefined` to the detect-rule clone and `expectedValueType: handler.expectedValueType ? [...handler.expectedValueType] : undefined` at the handler level.

### 🟢 78. No integration test for `radio.options()`
- **File:** `tests/group-order-controls.spec.ts`
- **Closed:** 2026-03-04 — Added test: `const opts = await home.shipping.options(); expect(opts).toEqual(["Standard", "Express", "Overnight"]);` to the “Order Controls” describe block.

### 🟡 89. `clickInContainer` doesn't validate empty `text` parameter
- **File:** `src/interaction.ts`
- **Closed:** 2026-03-04 — Added `if (!text.trim()) throw new Error("clickInContainer: text must be a non-empty string");` guard at the top of `clickInContainer`.

### 🟢 100. `By.*` factory methods don't validate empty/degenerate string arguments
- **File:** `src/by.ts`
- **Closed:** 2026-03-04 — Added non-empty string validation to `By.label()`, `By.css()`, `By.text()` (string path only), and both parameters of `By.shadow()`.

### 🟡 99. `overrideHandler()` JSDoc says "returns `this`" but returns a new instance
- **File:** `src/elements/group-types.ts` (`overrideHandler` JSDoc, line ~114)
- **Closed:** 2026-03-04 — Changed `@returns \`this\` for fluent chaining` to document the immutable builder pattern: returns a new `GroupElement` with the override applied. Callers must capture the return value.

### 🟡 5. `DEFAULT_HANDLERS` objects are shared references, not frozen
- **File:** `src/default-handlers.ts`
- **Closed:** 2026-03-04 — Added deep-freeze loop after `DEFAULT_HANDLERS` declaration: each `DetectRule`, each handler's `detect` array, and each handler object are now `Object.freeze()`-d at module load. Updated type to `readonly Readonly<ElementHandler>[]`.

### 🟢 15. `By` factory methods have significant code duplication
- **File:** `src/by.ts`
- **Closed:** 2026-03-04 — Extracted `private static _simple(desc, resolve)` helper that encapsulates the shared `new By(rawResolve, desc, probeResolve)` + `_warnIfAmbiguous` pattern. `label()`, `role()`, `css()`, `text()`, and `shadow()` now delegate to it.

### 🟢 34. No unit test for `configureResolveRetry` / `resetResolveRetry`
- **File:** `tests/unit/resolve-retry.spec.ts` (new)
- **Closed:** 2026-03-04 — Added 14 unit tests covering: default values, individual and combined `configureResolveRetry` updates, `RangeError` on zero/negative timeout and empty intervals, `resetResolveRetry` round-trips, idempotency, and the public API wrappers from `defaults.ts`.

### 🟢 42. `errors.spec.ts` imports from `@playwright/test` instead of `test-fixture.js`
- **File:** `tests/unit/errors.spec.ts` (line 1)
- **Closed:** 2026-03-04 — Changed import from `@playwright/test` to `../../src/test-fixture.js` to match the project convention.

### 🟡 91. `radio.options()` passes raw `opts` instead of `{ timeout: t(opts) }` to `resolveInputLabel`
- **File:** `src/elements/radio.ts` (`options` method)
- **Closed:** 2026-03-04 — Changed `resolveInputLabel(radios.nth(i), container, opts)` to `resolveInputLabel(radios.nth(i), container, { timeout })`, matching the Issue 88 pattern applied to `radio.read()` and `select.read()`. Builder-default timeouts now propagate to all internal calls.

### 🟡 92. `tableRow.refresh()` doesn't preserve `exact` option from original `findRow()` call
- **File:** `src/elements/table.ts` (`refresh` method; `createTableRowElement`)
- **Closed:** 2026-03-04 — Added `exact` parameter to `createTableRowElement`, stored in the closure, and threaded through to `scanRowsLocator` in `refresh()` and `rebuild()`. `findRow({ name: "Mouse" }, { exact: true })` followed by `refresh()` now preserves exact-match semantics.

### 🟡 93. `readHeaders()` helper in `table.ts` doesn't propagate builder-default timeout
- **File:** `src/elements/table.ts` (`readHeaders` helper)
- **Closed:** 2026-03-04 — Changed `timeout: options?.timeout` to `timeout: options?.timeout ?? defaultTimeout` in the `waitFor` call. All callers (`headers()`, `sort()`, `findRow()`, `tableRow.get()`, `tableRow.refresh()`) now inherit the builder-default timeout.

### 🟡 94. `table.findRow({})` with empty criteria vacuously matches first row
- **File:** `src/elements/table.ts` (`findRow`)
- **Closed:** 2026-03-04 — Added early guard: `if (Object.keys(criteria).length === 0) throw new Error("findRow: criteria must contain at least one column/value pair.")`. Empty criteria now throw instead of silently matching the first row.

### 🟡 95. `table.isEmpty()` silent catch block catches all errors, not just timeouts
- **File:** `src/elements/table.ts` (`isEmpty` method)
- **Closed:** 2026-03-04 — Narrowed bare `catch {}` to `catch (err) { if (err instanceof Error && err.message.includes("Timeout")) return false; throw err; }`. Non-timeout errors (protocol errors, frame detached, etc.) now propagate instead of being silently swallowed.

### 🟡 71. `readHeaders()` in `table.ts` accepts `options` parameter it never uses — and doesn't wait for DOM readiness
- **File:** `src/elements/table.ts` (`readHeaders` helper function)
- **Closed:** 2026-03-04 — Added `await headerCells.first().waitFor({ state: "attached", timeout: options?.timeout })` before `allTextContents()`, matching the pattern used in `rows()`. The `options` parameter is now functional — callers' timeouts propagate correctly to the header wait.

### 🟡 77. `radio.options()` missing timeout propagation to `resolveInputLabel`
- **File:** `src/elements/radio.ts` (`options` method)
- **Closed:** 2026-03-04 — Changed `resolveInputLabel(radios.nth(i), container)` to `resolveInputLabel(radios.nth(i), container, opts)`, propagating the per-call timeout to all internal `getAttribute()` and `textContent()` calls.

### 🟡 87. `buildElementFromProvider` missing `defaultTimeout` validation
- **File:** `src/elements/base.ts` (`buildElementFromProvider`)
- **Closed:** 2026-03-04 — Added `if (opts.defaultTimeout !== undefined && opts.defaultTimeout <= 0) throw new RangeError(...)` at the top of `buildElementFromProvider`, matching the existing guard in `buildElement`. Group elements, table row elements, and scoped groups from `find()` now reject non-positive timeouts at construction.

### 🟡 88. `radio.read()` and `select.read()` bypass builder-default timeout
- **File:** `src/elements/radio.ts`, `src/elements/select.ts`
- **Closed:** 2026-03-04 — Changed both `read()` methods to pass `{ timeout: t(opts) }` instead of raw `opts` to their external helper functions (`readCheckedRadioLabel`, `readSelectedOptionText`). Builder-default timeouts now propagate correctly when no per-call timeout is specified.

### 🟡 54. `registerHandler()` doesn't validate that `set`/`get` are functions at runtime
- **File:** `src/handler-registry.ts` (`registerHandler`)
- **Closed:** 2026-03-04 — Added `typeof handler.set !== "function"` and `typeof handler.get !== "function"` runtime guards at the top of `registerHandler()`, before the detect-rule validation. JavaScript/dynamic callers now get a descriptive error at registration time instead of an opaque `"is not a function"` error at call time.

### 🟡 59. `comboboxSet` body-level fallback matches options from ALL comboboxes on the page
- **File:** `src/default-handlers.ts` (line ~75)
- **Closed:** 2026-03-04 — Added an intermediate fallback that searches for a `[role="listbox"]` within the 5 nearest ancestors before falling back to the full page body. This scoped search catches most framework-rendered listboxes (adjacent/sibling to the combobox) while still allowing the body-level fallback for portaled/teleported dropdowns.

### 🟡 60. `table.findRow()` uses substring matching but this is undocumented
- **File:** `src/elements/table.ts` (`scanRowsLocator`, `findRow`)
- **Closed:** 2026-03-04 — Added comprehensive JSDoc documenting the default substring-matching semantics. Added `FindRowOptions` interface with an `exact?: boolean` option (default `false`). When `exact: true`, `scanRowsLocator` uses strict equality (`===`) instead of `includes()`. The `FindRowOptions` type is exported from the barrel.

### 🟡 66. `stepper.set()` silently misbehaves with non-integer target values
- **File:** `src/elements/stepper.ts` (`set` method)
- **Closed:** 2026-03-04 — Added a `!Number.isFinite(target) || !Number.isInteger(target)` guard at the top of `set()` that throws `RangeError` for non-integer, NaN, or Infinity values. The guard fires before the strategy selection, so both "click" and "fill" paths are protected.

### 🟡 67. `dialog.title()` CSS injection via `aria-labelledby` ID with special characters
- **File:** `src/elements/dialog.ts` (`title` method)
- **Closed:** 2026-03-04 — Already resolved: `CSS.escape(id)` is present at line 160 of `dialog.ts`. The `aria-labelledby` fallback correctly uses `el.locator(\`#${CSS.escape(id)}\`)` for each space-separated ID, which handles all CSS metacharacters (`.`, `:`, `>`, `~`, `+`, `#`, leading digits, etc.).

### 🟡 38. `text.read()` uses `innerText()` while other read methods use `textContent()`
- **File:** `src/elements/text.ts` (line ~20)
- **Closed:** 2026-03-04 — Changed `text.read()` from `innerText()` to `textContent()`, making it consistent with `button.read()`, `toast.read()`, and the handler-level `textContentGet`. The framework now uniformly uses `textContent()` for all text extraction, avoiding layout-dependent differences.

### 🟡 41. `comboboxSet` silently succeeds when no matching option exists
- **File:** `src/default-handlers.ts` (lines ~67–82)
- **Closed:** 2026-03-04 — The page-level option fallback now throws a descriptive error (`comboboxSet: no matching option found for value "..."`) instead of returning silently when no dropdown option matches either the linked listbox or the page-level search.

### 🟡 50. `table.isEmpty()` accepts `timeout` but silently ignores it
- **File:** `src/elements/table.ts` (`isEmpty` method)
- **Closed:** 2026-03-04 — When a timeout is provided, `isEmpty()` now uses `waitFor({ state: "attached", timeout })` to wait for the empty-state element before returning `true`. Falls back to instant `count()` check (returning `false`) if wait times out. Without a timeout, instant-snapshot semantics are preserved.

### 🟡 51. `readCheckedRadioLabel()` produces opaque timeout error when no radio is checked
- **File:** `src/label-resolution.ts` (`readCheckedRadioLabel`)
- **Closed:** 2026-03-04 — Added `await checked.count() === 0` guard that returns `""` immediately when no radio is checked, consistent with other read methods returning empty strings for absent state. Also narrowed to `checked.first()` before passing to `resolveInputLabel` to avoid strict-mode violations.

### 🟡 53. `table.sort()` `th.textContent()` call ignores available `timeout`
- **File:** `src/elements/table.ts` (`sort` method)
- **Closed:** 2026-03-04 — Now passes `{ timeout }` to `th.textContent()` inside the header iteration loop, matching the timeout propagation already applied to `th.click()` and other calls in the same method.

### 🟡 27. `resolveInputLabel` CSS selector injection via `id`
- **File:** `src/label-resolution.ts` (line ~43)
- **Closed:** 2026-03-04 — Applied `CSS.escape(id)` to the `label[for="..."]` CSS selector in `resolveInputLabel()`, matching the pattern already used in `default-handlers.ts` and `dialog.ts`. IDs with CSS-special characters (`"`, `]`, `\`, etc.) are now safely escaped.

### 🟡 28. `button.read()` doesn't trim, inconsistent with handler-level `textContentGet`
- **File:** `src/elements/button.ts` (line ~24)
- **Closed:** 2026-03-04 — Added `.trim()` to `button.read()`, making it consistent with the handler-level `textContentGet` in `default-handlers.ts` and with `toast.read()` / `text.read()`.

### 🟡 29. `stepper.read()` silently returns `NaN` for non-numeric inputs
- **File:** `src/elements/stepper.ts` (line ~73)
- **Closed:** 2026-03-04 — Added a `Number.isNaN(n)` guard after `parseInt`. Now throws a descriptive error (`stepper.read(): input value "..." is not a valid integer`) instead of silently returning `NaN`.

### 🟡 31. `tableRow.refresh()` uses XPath `ancestor::table` — fails in Shadow DOM
- **File:** `src/elements/table.ts` (line ~456)
- **Closed:** 2026-03-04 — Added a `tableLoc` parameter to `createTableRowElement` that captures the parent table's locator provider from `findRow()`. `refresh()` now uses `await tableLoc()` instead of `rowLocator.locator("xpath=ancestor::table")`, eliminating the XPath axis that cannot cross Shadow DOM boundaries.

### 🟡 32. `group.find()` drops `byDescriptor` from the child group
- **File:** `src/elements/group-find.ts` (line ~58)
- **Closed:** 2026-03-04 — Now passes `` `${deps.byDescriptor ?? "group"}.find("${text}")` `` as the 5th `byDescriptor` argument to `buildGroup()`, consistent with `group-override.ts`.

### 🔴 1. Silent ALS fallback to `defaultContext`
- **File:** `src/context.ts` (`getActiveContext()`), `src/test-fixture.ts`
- **Closed:** 2026-03-04 — Strict context mode is now **ON by default** (`_strictContextMode = true`); `getActiveContext()` throws when called outside both an ALS scope and a fixture fallback instead of silently returning `defaultContext`. Non-strict path now warns on **every** call (one-time guard removed). `runWithContext()` includes a runtime ALS propagation assertion that fires immediately if `getStore()` doesn't return the scoped context. New `setFallbackContext()` API installed by the test fixture ensures isolation even when Playwright's `use()` breaks ALS propagation. Also fixed 60 pre-existing unit test failures caused by the original strict-mode + ALS non-propagation combination.

### 🔴 4. Middleware type erasure — `as Promise<T>` cast with no runtime guard
- **File:** `src/middleware-pipeline.ts` (`runAction`)
- **Closed:** 2026-03-04 — `MiddlewarePipeline` now accepts a `debugEnabledProvider` callback (injected by `FrameworkContext`). When `debugEnabled` is true, `runAction` captures the raw action's return value and compares its runtime type (`typeof` + `constructor.name`) against the middleware pipeline's resolved value. A mismatch throws a descriptive error identifying the action, element type, and type mismatch. Zero overhead in the non-debug path.

### 🟡 6. `defaultContext.reset()` in test fixture masks ALS propagation failure
- **File:** `src/test-fixture.ts`
- **Closed:** 2026-03-04 — Resolved as part of Issue 1. The fixture now installs a `setFallbackContext()` per-test context and relies on the ALS propagation assertion in `runWithContext()`. Pre-test `defaultContext.reset()` is retained only as a safety net (the fallback context is the primary isolation mechanism). Post-test cleanup clears the fallback via `setFallbackContext(undefined)`.

### 🔴 2. `retryUntil` result-based detection is fragile (duck-typing)
- **File:** `src/retry.ts`
- **Closed:** 2026-03-04 — Legacy exception-based overload deleted; `retryUntil` now only accepts the result-based `RetryResult<T>` callback form, eliminating the duck-typing ambiguity entirely.

### 🔴 3. `radio.options()` ignores `opts` — normalization and timeout not propagated
- **File:** `src/elements/radio.ts`
- **Closed:** 2026-03-04 — The `normalize` property was removed from `LabelActionOptions` (see Issue 46). Timeout was already propagated via `t(opts)`. The issue no longer applies.

### 🟡 13. `table.rows()` / `findRow()` Shadow DOM probe not cached
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Shadow DOM `evaluate()` fast path deleted entirely. Both `rows()` and `findRow()` now always use the Locator-based path, which works with Shadow DOM unconditionally. No probe to cache.

### 🟢 22. `Object.setPrototypeOf` in error classes is unnecessary for ES2022 target
- **File:** `src/errors.ts`
- **Closed:** 2026-03-04 — All `Object.setPrototypeOf(this, new.target.prototype)` calls removed from `ElementNotFoundError`, `AmbiguousMatchError`, `ColumnNotFoundError`, and `NoHandlerMatchError`.

### 🟢 23. `NonRetryableError` deprecated but still in primary export
- **File:** `src/index.ts`, `src/errors.ts`
- **Closed:** 2026-03-04 — `NonRetryableError` class deleted from `errors.ts` and its export removed from `index.ts`. The legacy exception-based retry overload that used it was also deleted.

### 🟡 30. Shadow DOM probe only checks the first table row
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Shadow DOM `evaluate()` fast path deleted entirely. The heuristic probe no longer exists; the Locator-based path is always used.

### 🟡 33. Silent `.catch(() => true)` in Shadow DOM probe swallows unrelated errors
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Shadow DOM probe and its `.catch(() => true)` deleted entirely. No silent error swallowing remains.

### 🟡 39. `table.rows()` duplicates header-cleaning logic instead of using `readHeaders()`
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — `rows()` now delegates to `readHeaders()` for header text. The inline regex was extracted to a shared `cleanHeaderText()` function used by both `readHeaders()` and `sort()`.

### 🟡 40. `table.sort()` resolves `loc()` three times
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Sort strategies 2 and 3 deleted. `sort()` now has a single strategy (text-content match) and calls `loc()` once via `const tableEl = await loc()`.

### 🟢 45. `setActiveContext()` is dead exported function (always throws)
- **File:** `src/context.ts`
- **Closed:** 2026-03-04 — `setActiveContext()` function deleted entirely from `context.ts`.

### 🟡 46. `group.write()` / `group.read()` silently drop `normalize` from `LabelActionOptions`
- **File:** `src/elements/group.ts`, `src/handler-types.ts`
- **Closed:** 2026-03-04 — `normalize` property removed from `LabelActionOptions`. The option was silently dropped at every call site, so removing it makes the API honest. Default normalization always applies via `normalizeRadioLabel()`.

### 🟢 47. `baseProps` exported in extension API but superseded, lacks `@deprecated`
- **File:** `src/elements/base.ts`, `src/extend.ts`
- **Closed:** 2026-03-04 — `baseProps()` function and `BasePropsWithLocProvider` interface deleted from `base.ts`. Exports removed from `elements/index.ts` and `extend.ts`.

### 🟡 52. `table.sort()` also duplicates header-cleaning regex (extension of Issue 39)
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Shared `cleanHeaderText()` function extracted. `sort()` now uses it instead of an inline regex copy.

### 🟡 70. `retryUntil` legacy overload silently retries `NonRetryableError`
- **File:** `src/retry.ts`, `src/errors.ts`
- **Closed:** 2026-03-04 — Both the legacy exception-based overload and `NonRetryableError` class deleted. Only the result-based overload remains, which correctly handles `retryable: false` (see Issue 75 fix).

### 🔴 75. `retryUntil` result-based `retryable: false` path is caught by local catch
- **File:** `src/retry.ts`
- **Closed:** 2026-03-04 — Restructured the retry loop to use a sentinel variable. Non-retryable errors are now detected inside the `try` block and thrown **outside** it via `if (hasNonRetryable) throw nonRetryableError;`, so the `catch` block cannot swallow them.

### 🟡 76. `table.sort()` aria-label fallback uses substring matching (`*=`)
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — Sort strategies 2 (aria-label) and 3 (data-sort-key) deleted entirely. Only the text-content exact-match strategy remains.

### 🟡 10. `select.options()` returns untrimmed text
- **File:** `src/elements/select.ts` (line ~31)
- **Closed:** 2026-03-04 — Added `.map((s) => s.trim())` to the `allTextContents()` result, consistent with all other read methods.

### 🟡 11. `dialog.title()` doesn't handle space-separated `aria-labelledby` IDs
- **File:** `src/elements/dialog.ts` (line ~155)
- **Closed:** 2026-03-04 — `aria-labelledby` value is now split on whitespace; each ID is resolved individually via `CSS.escape()`, and their text content is joined with a space separator.

### 🟡 12. `comboboxSet` XPath injection risk
- **File:** `src/default-handlers.ts` (line ~72)
- **Closed:** 2026-03-04 — Replaced raw XPath `@id="${listboxId}"` interpolation with `CSS.escape(listboxId)` and a CSS `#id` selector, eliminating the injection vector.

### 🟡 14. No validation of `ElementOptions.timeout` being positive
- **File:** `src/elements/base.ts` (`buildElement`)
- **Closed:** 2026-03-04 — Added `if (defaultTimeout !== undefined && defaultTimeout <= 0) throw new RangeError(...)` guard at the top of `buildElement`.

### 🟡 7. `table()` resolves `ctx` separately from `buildElement`
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — `table()` now destructures `ctx` from `buildElement`'s return (`{ loc, t, base, ctx, meta }`) instead of resolving it separately via `options?.context ?? getActiveContext()`. Removed the now-unused `getActiveContext` import.

### 🟡 8. `createTableRowElement` has `getActiveContext()` default parameter
- **File:** `src/elements/table.ts`
- **Closed:** 2026-03-04 — `ctx` parameter changed from `ctx: IFrameworkContext = getActiveContext()` to `ctx: IFrameworkContext` (required, no default). All existing call sites already pass `ctx` explicitly.

### 🟡 9. `checkboxgroupSet` vs `checkboxgroupGet` — normalization asymmetry
- **File:** `src/default-handlers.ts`
- **Closed:** 2026-03-04 — `checkboxgroupGet` now calls `.toLowerCase()` on each label before returning, matching the case-insensitive comparison in `checkboxgroupSet`. Round-trip `get(set(x))` is now consistent.

### 🟢 36. No unit test for `createHandler` (extension API)
- **File:** `tests/unit/create-handler.spec.ts`, `src/default-handlers.ts`
- **Closed:** 2026-03-04 — Added `tests/unit/create-handler.spec.ts` with 5 tests: extend without overrides, override set/get while preserving detect, override detect rules, invalid base type throws, override valueKind.

### 🟢 37. `checkboxgroupSet` comma-splitting convention is undocumented and ambiguous
- **File:** `src/default-handlers.ts`
- **Closed:** 2026-03-04 — Added comprehensive JSDoc to `checkboxgroupSet` documenting comma-splitting semantics and recommending the `string[]` path to avoid ambiguity.

### 🟢 43. Unused `Locator` import in `handlers.spec.ts`
- **File:** `tests/unit/handlers.spec.ts`
- **Closed:** 2026-03-04 — Removed the unused `import type { Locator }` line.

### 🟢 44. `By.text(RegExp)` overload has no integration test
- **File:** `tests/by-strategies.spec.ts`
- **Closed:** 2026-03-04 — Added integration test resolving `By.text(/GeneralStore/i)` against a live page and asserting visibility.

### 🟢 48. `errors.spec.ts` doesn't test `NoHandlerMatchError`
- **File:** `tests/unit/errors.spec.ts`
- **Closed:** 2026-03-04 — Added 4-test describe block for `NoHandlerMatchError` covering instanceof chain, structured context properties (tag, role), role default, and stack trace.

### 🟢 49. `configureResolveRetry` doesn't validate individual interval values
- **File:** `src/resolve-retry-config.ts`
- **Closed:** 2026-03-04 — Added `if (opts.intervals.some((v) => v <= 0)) throw new RangeError(...)` validation. Added 3 unit tests: rejects negative intervals, rejects zero intervals, rejects mixed.

### 🟢 56. No unit test for `coercion.ts` helpers
- **File:** `tests/unit/coercion.spec.ts`
- **Closed:** 2026-03-04 — Added 24-test unit file covering `asString`, `asNumber`, `asBoolean`, `asStringArray` including edge cases (array join, NaN throw, boolean-string parsing, type wrapping).

### 🟢 57. No unit test for `clickInContainer()`
- **File:** `tests/unit/click-in-container.spec.ts`
- **Closed:** 2026-03-04 — Added 7-test unit file using `page.setContent()` exercising button priority, link fallback, text fallback, button-over-link priority, link-over-text priority, empty text throw, whitespace-only throw.

### 🟢 58. No integration test for `group.overrideHandler()` with string type names
- **File:** `tests/override-handler.spec.ts`
- **Closed:** 2026-03-04 — Added 4 integration tests: string type override, object-literal override, invalid type throws, immutable builder (original unaffected).

### 🟢 62. No integration test for `group.find()`
- **File:** `tests/group-find.spec.ts`, `src/elements/group-find.ts`
- **Closed:** 2026-03-04 — Added 3 integration tests: narrows to matching container, ElementNotFoundError on no match, AmbiguousMatchError on multiple matches. Also fixed a latent bug where `container.getByText()` was used as the `has` filter locator instead of `container.page().getByText()` — Playwright resolves the full locator path relative to each element, so `container.getByText()` would never match (it looked for nested container elements).

---

## How to Use This File

- **Close an issue:** Move it to "Closed Issues" with a date, commit SHA, and brief note.
- **Add an issue:** Append to "Open Issues" with the next number, severity, file, problem, and fix.
- **Agent instructions:** When asked to fix architecture issues, read this file first. After fixing, update the status here.
