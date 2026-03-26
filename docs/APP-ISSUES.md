# App Issues Tracker

> **Created:** 2026-03-24
> **Source:** Extracted from ISSUES.md — app-level issues separated from framework/crawler issues.
> **Scope:** Issues specific to the 7 test fixture apps (vanilla-html, react-app, vue-app, angular-app, svelte-app, nextjs-app, lit-app). These apps exist as test surfaces for the framework — they don't ship to production.
> **Note:** These apps use their technology's native component library (MUI, Vuetify, Angular Material, Bits UI, Shoelace, native HTML) to provide DOM diversity for framework testing. Issues here are about app correctness, not framework functionality.

## Summary

| Priority | Open |
|----------|------|
| 🔴 P0    | 1    |
| 🟡 P1    | 10    |
| 🟢 P2    | 33   |
| ⚪ P3    | 13   |
| **Total** | **57** |

---

## Open Issues

### P0 (Critical)

#### P0-8. Vue `v-data-table` allows neutral/unsorted third state — violates §6.6 behavioral contract

- **Scope:** `apps/vue-app/src/pages/Home.vue`
- **Problem:** Missing `must-sort` prop on `<v-data-table>`. Vuetify's default sort cycle is ascending → descending → unsorted. §6.6 requires: "Third click → back to ascending. No neutral/unsorted toggle." Vue also doesn't import/use `sortProducts` or `toggleSort` from `@shared/logic` — sorting is fully delegated to Vuetify, which may produce different string and boolean comparison behavior than the shared pipeline used by all other apps.
- **Impact:** Vue app violates the core behavioral contract that the cross-app test thesis relies on. Sort behavior differs from all 6 other apps.
- **Recommendation:** Add `must-sort` prop to `<v-data-table>`. Consider importing and using the shared `sortProducts`/`toggleSort` functions, or at minimum verify Vuetify's sort produces identical results.


### P1 (High)

#### P1-39. React and Next.js toast implementations use custom `<div>` instead of MUI `<Snackbar>` + `<Alert>` — §6.7 matrix mismatch

- **Scope:** `apps/react-app/src/pages/Home.tsx`, `apps/nextjs-app/app/HomeClient.tsx`, `docs/REQUIREMENTS.md` §6.7
- **Problem:** Both apps use `<div className="toast">` for toast notifications. The §6.7 component matrix specifies MUI `<Snackbar>` + `<Alert>` for React and Next.js. Using the same custom `<div>` pattern across React, Next.js, Angular, and vanilla defeats the purpose of testing against different component libraries' DOM structures.
- **Impact:** The §6.7 matrix exists to ensure DOM diversity. Four apps using identical custom `<div>` toast means toast handling is only tested against 3 genuinely different DOM patterns (Vuetify, custom div, Lit web component) instead of the documented 7.
- **Recommendation:** Either implement MUI `<Snackbar>` + `<Alert>` in React and Next.js, or update the §6.7 matrix to reflect reality and accept the reduced DOM diversity for toasts.


#### P1-40. Vue toast uses custom `<div>` instead of Vuetify `<v-snackbar>` — §6.7 matrix mismatch

- **Scope:** `apps/vue-app/src/pages/Home.vue`, `docs/REQUIREMENTS.md` §6.7
- **Problem:** Uses a custom `<div class="toast">` backed by a composable. The §6.7 matrix specifies `<v-snackbar>`. Vuetify's `<v-snackbar>` produces significantly different DOM (portaled overlay, transition wrapper, dismissible action button).
- **Impact:** Same as P1-39 — reduced DOM diversity for toast testing.
- **Recommendation:** Either implement `<v-snackbar>` or update the matrix.


#### P1-47. Angular `handleMatSort()` allows neutral/unsorted third state — violates §6.6 behavioral contract

- **Scope:** `apps/angular-app/src/app/pages/home.component.ts`, `apps/angular-app/src/app/pages/home.component.html`
- **Problem:** Angular Material's `matSort` directive cycles through ascending → descending → unsorted by default. `handleMatSort()` explicitly handles the empty direction case (`sort.direction === ''`) by setting `this.sortKey = null` — creating an unsorted state. This violates §6.6: "Third click → back to ascending. No neutral/unsorted toggle." Additionally, `handleMatSort()` directly manipulates sort state instead of calling the shared `toggleSort()` function, creating a divergent sort implementation.
- **Impact:** Angular app can reach a sort state that no other app can. Cross-app sort tests may behave inconsistently. Same class of bug as P0-8 (Vue) but Angular at least uses `filterAndSortProducts` from shared.
- **Recommendation:** Add `matSortDisableClear` to the `<table mat-table matSort>` element in the template. Refactor `handleMatSort()` to delegate to shared `toggleSort()` for state transitions.


#### P1-48. Lit app README omits Shoelace as a key dependency — falsely implies native form controls

- **Scope:** `apps/lit-app/README.md`
- **Problem:** The Lit README's technology table lists only "Lit 3+" and "Vite" — no mention of Shoelace. The app heavily depends on Shoelace (`@shoelace-style/shoelace ~2.20.1`) for `<sl-select>`, `<sl-checkbox>`, `<sl-radio-group>`, `<sl-radio>`, and `<sl-input>`. The README's "UI Contract Notes" section describes the app as if it uses native form controls, but it actually uses Shoelace components for most form elements. REQUIREMENTS.md §6.7 notes mention "Shoelace" but the README doesn't reflect this.
- **Impact:** Contributors comparing app implementations will be misled about the Lit app's DOM structure. Debugging test failures requires knowing Shoelace is in play.
- **Recommendation:** Add Shoelace 2.x to the Technology table. Update "UI Contract Notes" to reflect Shoelace usage for form controls.


#### P1-53. Vue `filteredProducts` bypasses shared `sortProducts` — cross-app sort inconsistency

- **Scope:** `apps/vue-app/src/pages/Home.vue`
- **Problem:** Vue imports only `filterProducts` from `@shared/logic`, never `sortProducts`, `filterAndSortProducts`, or `toggleSort`. Sorting is fully delegated to Vuetify's `v-data-table`, which uses its own comparison algorithm (`Intl.Collator` for strings, generic comparison for other types). The shared `sortProducts` does explicit `toLowerCase()` for string comparison and `boolean→number` conversion (`true→1, false→0`). These algorithms can produce different orderings — especially for booleans and locale-sensitive strings.
- **Impact:** REQUIREMENTS §6.6 mandates identical sort behavior across all 7 apps. Tests asserting row order after sorting could pass in 6 apps and fail in Vue. Related to but distinct from P0-8 (which covers the neutral/unsorted third state).
- **Recommendation:** Use `v-data-table`'s `custom-sort` prop to delegate to shared `sortProducts`, or import `filterAndSortProducts` and sort before passing to `v-data-table`.


#### P1-54. Lit `general-store-order-controls` shipping radio labels hardcoded instead of using shared `SHIPPING`

- **Scope:** `apps/lit-app/src/components/general-store-order-controls.ts`
- **Problem:** The Shoelace `<sl-radio>` labels are hardcoded strings (`"Standard — $4.99"`, etc.) while every other framework app iterates `Object.entries(SHIPPING)` dynamically. The component doesn't import `SHIPPING` at all. If shared `SHIPPING` costs or labels change, the radio labels and the radio output would disagree.
- **Impact:** Breaks the single-source-of-truth principle. All other apps (React, Vue, Angular, Svelte, Next.js) render radio options from the shared `SHIPPING` object. Lit's labels could silently drift from canonical data.
- **Recommendation:** Pass `SHIPPING` entries as a property from the parent (or import `SHIPPING` directly) and render radio options dynamically in the template.


#### P1-58. Framework README Angular compatibility row lists "MatSnackBar" — removed by P2-88

- **Scope:** `framework/README.md`
- **Problem:** The Cross-App Compatibility table row for Angular says `"Angular Material ^19.2.19 (mat-datepicker, MatDialog, MatSnackBar)"`. P2-88 removed the `snackBar.open()` call. P0-5 tracks the same issue in REQUIREMENTS.md §6.7 but this is a separate document.
- **Impact:** Framework README misleads about Angular's actual component library usage.
- **Recommendation:** Remove "MatSnackBar" from the Angular row. Replace with "custom toast" or omit.


#### P1-63. React and Next.js toast timer not reset on rapid re-triggers — premature dismissal

- **Scope:** `apps/react-app/src/pages/Home.tsx`, `apps/nextjs-app/app/HomeClient.tsx`
- **Problem:** Both apps use `setTimeout(() => setShowToast(false), 3000)` without clearing the previous timer via `clearTimeout`. If "Add to Cart" is clicked twice within 3 seconds, the first timer fires and hides the toast while the second timer is still pending. The toast disappears prematurely after 3s from the first click rather than 3s from the second click.
- **Impact:** Violates §6.6 toast auto-dismiss spec which implies the timer resets on re-trigger. Other apps (Vue composable, Svelte store) correctly clear the previous timer. Cross-app toast timing tests could be flaky.
- **Recommendation:** Store the timer ID in a ref (`useRef`) and call `clearTimeout(timerRef.current)` before setting a new timeout.


#### P1-73. Vanilla shipping radio labels hardcoded in HTML — shared data violation

- **Scope:** `apps/vanilla-html/index.html`
- **Problem:** `Standard — $4.99`, `Express — $9.99`, `Overnight — $19.99` are static HTML strings, not derived from `SHIPPING` data in shared. The computed `radioOutput` text correctly reads from `SHIPPING`, but the label text does not. If costs change in `shared/data.ts`, the labels become stale while the output stays correct.
- **Impact:** Silent data divergence. The other 5 framework apps (React, Next, Vue, Angular, Svelte) dynamically render radio labels from `SHIPPING` — vanilla and Lit (P1-54) are the two outliers.
- **Recommendation:** Generate the radio group DOM in `app.js` from `SHIPPING`, the same way the table rows are generated.


#### P1-74. Vue `useToast` composable uses module-level singleton state — stale toast on route re-entry

- **Scope:** `apps/vue-app/src/composables/useToast.ts`
- **Problem:** `toastMessage`, `toastVisible`, and `toastTimeout` are declared at module scope (outside `useToast()`), making them singletons that survive component unmount. When the user navigates Home → About (unmounting Home.vue), the toast refs persist. Navigating back within 3 seconds causes a stale toast to flash on remount.
- **Impact:** Behavioral inconsistency — toast reappears with stale content on navigation return. All other apps avoid this: Angular/React/Next use per-instance state; Svelte renders toast in App.svelte; Vanilla is a single page; Lit destroys on disconnect.
- **Recommendation:** Either render the toast in `App.vue` (like Svelte does via app shell), or move the refs inside `useToast()` so each component instance gets fresh state.


### P2 (Medium)

#### P2-89. Angular `MatSnackBar` / `MatSnackBarModule` are dead imports after P2-88

- **Scope:** `apps/angular-app/src/app/pages/home.component.ts` lines 5, 28, 44; `apps/angular-app/src/styles.css` line 392
- **Problem:** P2-88 removed the `snackBar.open()` call but intentionally left the `MatSnackBar` import, `MatSnackBarModule` in the component's `imports` array, and `private snackBar = inject(MatSnackBar)`. There is also orphaned CSS at `.generalstore-snackbar` for styling that no longer renders. These are dead code.
- **Impact:** Unnecessary bundle size, confusing for contributors, and a potential source of duplicate toast rendering if someone re-enables the call.
- **Recommendation:** Remove the `MatSnackBar` import, injection, module, and orphaned CSS. Also update the Angular README which still mentions `MatSnackBar`.


#### P2-91. React and Next.js MUI Dialog missing `<DialogTitle>` — accessibility gap

- **Scope:** `apps/react-app/src/pages/Home.tsx` (dialog section), `apps/nextjs-app/app/HomeClient.tsx` (dialog section)
- **Problem:** Both apps use MUI `<Dialog>` + `<DialogContent>` but omit `<DialogTitle>`. MUI's `<Dialog>` generates `aria-labelledby` pointing to a `DialogTitle` component's id. Without `<DialogTitle>`, the `aria-labelledby` reference is dangling — the modal has no accessible heading.
- **Impact:** WCAG 2.1 Level A violation. Screen readers cannot announce the dialog's purpose. The Svelte app correctly implements `Dialog.Title`.
- **Recommendation:** Add `<DialogTitle>` with the product name inside each `<Dialog>`.


#### P2-92. Lit dialog `<dialog>` element lacks `aria-labelledby` for its `<h2>` title

- **Scope:** `apps/lit-app/src/components/general-store-dialog.ts`
- **Problem:** The component renders a native `<dialog>` containing an `<h2>` title, but the `<dialog>` has no `aria-labelledby` attribute pointing to the heading's id.
- **Impact:** Screen readers may not announce the modal title when it opens. Native `<dialog>` does not automatically associate its content as a label.
- **Recommendation:** Add `id="dialog-title"` to the `<h2>` and `aria-labelledby="dialog-title"` to the `<dialog>` element.


#### P2-93. Vanilla-HTML table sort headers missing `aria-sort` attribute

- **Scope:** `apps/vanilla-html/index.html` and `apps/vanilla-html/app.js`
- **Problem:** Sortable `<th>` headers have `role="button" tabindex="0"` for click handling but no `aria-sort` attribute. When a column is sorted, the direction state (ascending/descending) is not conveyed to assistive technology.
- **Impact:** Screen reader users cannot determine the current sort state. REQUIREMENTS §6.4 requires "ARIA attributes" for dynamic content.
- **Recommendation:** Toggle `aria-sort="ascending"` / `aria-sort="descending"` on the active `<th>` when sort state changes. Remove `aria-sort` from inactive columns.


#### P2-96. `angular-app/dist/` and `react-app/dist/` build artifacts committed to git

- **Scope:** `apps/angular-app/dist/`, `apps/react-app/dist/`
- **Problem:** Build output directories are present in the repository. These contain minified JS bundles, CSS, and source maps that are generated artifacts, not source code.
- **Impact:** Bloats repository size, creates unnecessary merge conflicts, and stale build artifacts can mask real issues. Contributors may unknowingly commit updated dist files.
- **Recommendation:** Add `apps/*/dist/` to `.gitignore` and remove the committed `dist/` directories.


#### P2-97. Angular README lists TypeScript `~5.7.2`, actual package.json has `~5.8.3`

- **Scope:** `apps/angular-app/README.md`
- **Problem:** The README technology table says TypeScript `~5.7.2` but `package.json` has `"typescript": "~5.8.3"`. P2-18 updated READMEs after Phase 10 but this version number was missed.
- **Impact:** Misleading documentation. Contributors debugging TypeScript compatibility issues against the wrong version.
- **Recommendation:** Update the README to `~5.8.3`.


#### P2-108. Multiple app READMEs are stale after Phase 10 component library migration

- **Scope:** `apps/vue-app/README.md`, `apps/angular-app/README.md`, `apps/react-app/README.md`, `apps/svelte-app/README.md`, `apps/nextjs-app/README.md`
- **Problem:** At least 6 factual errors across app READMEs: Vue says native `<select>` (actually Vuetify `<v-select>`); Angular says native `<select>` and `<table>` (actually `<mat-select>` and `mat-table`); React says `<dialog>` (actually MUI `<Dialog>`); Svelte says `<dialog>` (actually Bits UI `<Dialog.Root>`); Svelte lists nonexistent `src/data.ts` in file structure; Next.js says dev server (actually production build — overlap with P1-31).
- **Impact:** Misleading documentation for contributors comparing or modifying apps.
- **Recommendation:** Audit and update all 7 app READMEs to reflect current component library usage.


#### P2-109. Lit app text input uses native `<input>` instead of Shoelace `<sl-input>` per §6.7 matrix

- **Scope:** `apps/lit-app/src/components/general-store-filter-bar.ts`
- **Problem:** The checkbox (`<sl-checkbox>`) and select (`<sl-select>`) correctly use Shoelace. The text input uses native `<input type="text">`. The §6.7 matrix specifies `<sl-input>` for Lit.
- **Impact:** Reduced DOM diversity for text input testing. Inconsistent within the same component.
- **Recommendation:** Replace the native `<input>` with `<sl-input>` to match the matrix.


#### P2-110. Angular §6.7 matrix says CDK Dialog — actual code uses MatDialog

- **Scope:** `apps/angular-app/src/app/pages/product-dialog.component.ts`, `docs/REQUIREMENTS.md` §6.7
- **Problem:** The §6.7 matrix says "Angular CDK `Dialog`". The code uses `MatDialogRef` / `MAT_DIALOG_DATA` from `@angular/material/dialog`, which is Angular Material Dialog (built on CDK Dialog, but a distinct higher-level API).
- **Impact:** Misleading documentation. CDK Dialog and MatDialog have different APIs and DOM structures.
- **Recommendation:** Update the §6.7 matrix to say `Angular Material \<MatDialog\>`.


#### P2-111. React `useCallback(...)()` anti-pattern — should use `useMemo`

- **Scope:** `apps/react-app/src/pages/Home.tsx`, `apps/nextjs-app/app/HomeClient.tsx`
- **Problem:** Both apps create a memoized callback with `useCallback` and immediately invoke it with `()`. `useMemo` is the correct hook for memoizing a computed value; `useCallback` is for memoizing function identity for referential stability.
- **Impact:** Functionally works but wrong React semantics. Could confuse contributors familiar with React best practices.
- **Recommendation:** Replace `useCallback(fn, deps)()` with `useMemo(fn, deps)`.


#### P2-112. Next.js `HomeClient.tsx` is a ~250-line copy-paste of React `Home.tsx`

- **Scope:** `apps/nextjs-app/app/HomeClient.tsx`, `apps/react-app/src/pages/Home.tsx`
- **Problem:** Files differ only by the `'use client'` directive. Bug fixes in one must be manually propagated. All other shared behavior flows through `@shared/` — this component doesn't.
- **Impact:** Maintenance burden and divergence risk. Any fix applied to one app may not reach the other.
- **Recommendation:** Extract the shared component logic into a shared React file that both apps import, or accept the duplication and document it.


#### P2-113. Lit app has unused `_delayedLoaded` state variable

- **Scope:** `apps/lit-app/src/pages/general-store-home.ts`
- **Problem:** `@state() private _delayedLoaded = false;` is set to `true` after the delayed content timeout but is never read in the template or any logic path. Dead reactive state.
- **Impact:** Dead code. Causes unnecessary Lit re-renders when set.
- **Recommendation:** Remove the variable and its assignment.


#### P2-114. Lit app reimplements `formatDate` inline instead of importing from `@shared/logic`

- **Scope:** `apps/lit-app/src/pages/general-store-home.ts`
- **Problem:** The `_formattedDate` getter duplicates `formatDate` from `@shared/logic` (same `toLocaleDateString('en-US', ...)` call). Every other app imports and uses the shared function. This violates the convention stated in vanilla's `app.js`: "Do NOT duplicate data or logic here — use Shared.*"
- **Impact:** DRY violation. If date format changes in shared, the Lit app won't update.
- **Recommendation:** Import and call `formatDate()` from `@shared/logic`.


#### P2-115. Svelte checkbox label not semantically associated with Bits UI Checkbox

- **Scope:** `apps/svelte-app/src/pages/Home.svelte`
- **Problem:** `<label onclick={() => { inStockOnly = !inStockOnly; }}>` has no `for`/`id` association with `<Checkbox.Root>`. The click handler also toggles `inStockOnly` directly, bypassing the Checkbox's `onCheckedChange` callback. The label and checkbox have no HTML semantic association.
- **Impact:** Accessibility violation — screen readers can't associate label with checkbox. The `onclick` handler creates a double-toggle risk (both label click and checkbox change fire).
- **Recommendation:** Add `for`/`id` association or use Bits UI's label slot pattern.


#### P2-116. Angular `empty-state` class on `<td>` while all others put it on `<tr>`

- **Scope:** `apps/angular-app/src/app/pages/home.component.html`
- **Problem:** Angular's empty-state row uses `<td class="empty-state" colspan="5">`. All other apps (vanilla, React, Svelte, Lit) place `class="empty-state"` on the `<tr>`.
- **Impact:** Tests using `tr.empty-state` as a selector will fail for Angular only. Cross-app selector inconsistency.
- **Recommendation:** Move `class="empty-state"` to the `<tr>` element in Angular, matching all other apps.


#### P2-124. Lit `sl-change` events incorrectly cast targets as `HTMLSelectElement`/`HTMLInputElement`

- **Scope:** `apps/lit-app/src/components/general-store-filter-bar.ts`
- **Problem:** Casts `e.target` as `HTMLSelectElement` from `<sl-select>` and as `HTMLInputElement` from `<sl-checkbox>`. The actual targets are Shoelace `SlSelect` and `SlCheckbox` elements. Works by duck typing (`.value`/`.checked` exist on both) but the casts are technically incorrect.
- **Impact:** TypeScript type safety is circumvented. If Shoelace changes its property names, errors would be invisible at compile time.
- **Recommendation:** Import `SlSelect` and `SlCheckbox` types from `@shoelace-style/shoelace` and cast to those.


#### P2-125. Lit potential duplicate label for category select

- **Scope:** `apps/lit-app/src/components/general-store-filter-bar.ts`
- **Problem:** Both `<label for="category-select">Category</label>` (added by P2-86) and `<sl-select label="Category">` exist. Shoelace's `label` prop renders its own visible label inside the shadow DOM. The external `<label for="...">` may not correctly associate with the shadow-DOM-internal input of `sl-select`, resulting in a duplicate visible "Category" label.
- **Impact:** Visual duplication and potentially broken label association across the shadow boundary.
- **Recommendation:** Remove the Shoelace `label="Category"` prop since the external `<label>` handles labeling, or remove the external `<label>` and rely on Shoelace's built-in labeling.


#### P2-140. Lit `general-store-home` has no `disconnectedCallback` — two timer leaks

- **Scope:** `apps/lit-app/src/pages/general-store-home.ts`
- **Problem:** `connectedCallback` starts a 1500ms setTimeout for delayed content, and `_showToastMessage` starts a toast dismiss timer. Neither is cleaned up in a `disconnectedCallback`. If the component is removed from the DOM before either fires, the callbacks will attempt to set state on a disconnected element. Every other app properly cleans timers (React useEffect, Angular ngOnDestroy, Svelte $effect).
- **Impact:** Memory leak and potential errors during fast navigation or test teardown.
- **Recommendation:** Add `disconnectedCallback()` that clears both timeout handles.


#### P2-142. Lit `sl-radio-group` missing accessibility `label` attribute

- **Scope:** `apps/lit-app/src/components/general-store-order-controls.ts`
- **Problem:** The `<sl-radio-group>` has no `label` attribute or `aria-label`. Every other app provides explicit labeling on its radio group component (React/Next MUI has `aria-label="Shipping Method"`, Vue `v-radio-group` has `aria-label`, Angular `mat-radio-group` has `aria-label`). Shoelace docs require `sl-radio-group` to have a `label` for screen reader accessibility.
- **Impact:** Screen readers may not announce the radio group's purpose — accessibility gap unique to the Lit app.
- **Recommendation:** Add `label="Shipping Method"` to the `<sl-radio-group>` element.


#### P2-148. React and Svelte `tsconfig.app.json` missing `@shared/*` path alias — IDE type errors

- **Scope:** `apps/react-app/tsconfig.app.json`, `apps/svelte-app/tsconfig.app.json`
- **Problem:** Angular, Next.js, and Lit apps have `"@shared/*": ["../../shared/*"]` in their tsconfig paths. React and Svelte resolve `@shared` only via Vite's `resolve.alias` in `vite.config.ts`, but their tsconfig files lack the corresponding `paths` mapping.
- **Impact:** IDE TypeScript checking shows false errors for `@shared/*` imports in these apps.
- **Recommendation:** Add `"paths": { "@shared/*": ["../../shared/*"] }` to react-app and svelte-app tsconfig.app.json.


#### P2-153. Lit README claims "native `<select>`" for category dropdown — actually uses Shoelace `<sl-select>`

- **Scope:** `apps/lit-app/README.md`
- **Problem:** Two places in the Lit README say native `<select>`: the Shadow DOM table row and the UI Contract Notes. The actual code uses `<sl-select>` (confirmed by P2-86's resolution). This is distinct from P1-48 (which covers Shoelace omission from the Technology table); this is factually wrong element documentation.
- **Impact:** Contributors comparing app implementations will believe Lit uses a native select, when it actually uses Shoelace's shadow-DOM-wrapped `<sl-select>`.
- **Recommendation:** Update both locations to reflect `<sl-select>`.


#### P2-176. React and Next.js `setShipping(e.target.value)` passes `string` to `Dispatch<ShippingKey>` — type safety gap

- **Scope:** `apps/react-app/src/pages/Home.tsx` (line 237), `apps/nextjs-app/app/HomeClient.tsx` (line 239)
- **Problem:** Both apps type shipping state as `useState<ShippingKey>('standard')` (per P2-24). But the MUI `RadioGroup` onChange handler uses `setShipping(e.target.value)` where `e.target.value` is `string`, not `ShippingKey`. This bypasses the type narrowing from P2-24.
- **Impact:** A typo in a `<Radio value>` prop (e.g., `value="standrd"`) would silently set an invalid shipping key with no compile-time error.
- **Recommendation:** Cast explicitly: `setShipping(e.target.value as ShippingKey)`. Or use MUI's second callback: `onChange={(_e, value) => setShipping(value as ShippingKey)}`.


#### P2-186. Svelte and Lit sort headers missing `aria-sort` attribute — extends P2-93

- **Scope:** `apps/svelte-app/src/pages/Home.svelte`, `apps/lit-app/src/pages/general-store-home.ts`
- **Problem:** P2-93 identified missing `aria-sort` on vanilla-html `<th>` headers. The same issue exists in Svelte and Lit apps — their custom table header implementations don't set `aria-sort="ascending"` / `"descending"` on the active sort column. React (MUI), Vue (Vuetify), Angular (MatSort), and Next.js (MUI) get `aria-sort` automatically from their component libraries.
- **Impact:** `aria-validation.spec.ts` may silently skip or weakly assert these apps. Screen readers can't announce sort state for Svelte/Lit tables.
- **Recommendation:** Add `aria-sort` attribute binding to `<th>` elements in both Svelte and Lit apps, matching the vanilla-html fix from P2-93.


#### P2-235. Vanilla `<dialog>` missing `aria-labelledby="modal-title"`

- **Scope:** `apps/vanilla-html/index.html`
- **Problem:** The `<dialog id="product-modal">` has a child `<h2 id="modal-title">` but no `aria-labelledby="modal-title"` on the `<dialog>` element. Screen readers can't programmatically identify the dialog's purpose. P2-92 covers Lit; this is the vanilla equivalent.
- **Impact:** Accessibility gap in the reference implementation.
- **Recommendation:** Add `aria-labelledby="modal-title"` to the `<dialog>` element.


#### P2-236. Angular product dialog missing `mat-dialog-title` directive — no accessible name

- **Scope:** `apps/angular-app/src/app/pages/product-dialog.component.ts`
- **Problem:** Template has `<h2>{{ data.name }}</h2>` without the `mat-dialog-title` directive. Angular Material CDK won't auto-generate `aria-labelledby` on the dialog overlay without it. P2-91 covers React/Next `<DialogTitle>`; this is the Angular equivalent.
- **Impact:** Dialog has no accessible name for screen readers.
- **Recommendation:** Add `mat-dialog-title` directive to the `<h2>` element.


#### P2-237. Vue `<v-dialog>` uses plain `<h2>` — no dialog accessible name

- **Scope:** `apps/vue-app/src/pages/Home.vue`
- **Problem:** Uses `<h2>` inside `<v-card-text>` instead of `<v-card-title>`. Without `<v-card-title>`, Vuetify cannot auto-connect `aria-labelledby` on the dialog overlay.
- **Impact:** Screen readers can't announce the dialog's purpose. Completes the dialog-title gap across React/Next (P2-91), Lit (P2-92), Angular (P2-236), and now Vue.
- **Recommendation:** Use `<v-card-title>` for the heading.


#### P2-238. Svelte table headers missing `aria-sort` attribute

- **Scope:** `apps/svelte-app/src/pages/Home.svelte`
- **Problem:** Svelte's manual `<table>` has `role="button"` and `data-sort-key` on `<th>` elements, but does not set `aria-sort="ascending"` / `"descending"` when a column is actively sorted. P2-93 covers vanilla only; this is the Svelte equivalent.
- **Impact:** Screen readers cannot determine sorted column state.
- **Recommendation:** Add `aria-sort` attribute binding to `<th>` elements.


#### P2-239. Lit table headers missing `aria-sort` attribute

- **Scope:** `apps/lit-app/src/components/general-store-product-table.ts`
- **Problem:** Lit's product table adds CSS classes (`sort-asc`/`sort-desc`) but does not set the `aria-sort` attribute. Same gap as vanilla (P2-93) and Svelte (P2-238).
- **Impact:** Screen readers cannot determine sorted column state for Lit tables.
- **Recommendation:** Add `aria-sort` attribute binding to `<th>` elements.


#### P2-240. Vue date picker `<label>` not programmatically associated with input

- **Scope:** `apps/vue-app/src/pages/Home.vue`
- **Problem:** `<label>Choose a date</label>` has no `for` attribute. The `VueDatePicker` component provides `aria-label` on its internal input, but the visible `<label>` element is not connected to it. Clicking the label text does not focus the date picker.
- **Impact:** Accessibility violation. All other 6 apps properly associate the date picker label.
- **Recommendation:** Add a `for`/`id` association or use `aria-labelledby`.


#### P2-241. Svelte `Dialog.Root` missing `Dialog.Overlay` — no visual backdrop

- **Scope:** `apps/svelte-app/src/pages/Home.svelte`
- **Problem:** `<Dialog.Root>` directly wraps `<Dialog.Content>` with no `<Dialog.Overlay>`. Bits UI handles click-outside but without `Dialog.Overlay` there's no visual dimming. The CSS `::backdrop` rules target native `<dialog>` — Bits UI doesn't use native `<dialog>`.
- **Impact:** All other 6 apps show a visible backdrop/overlay.
- **Recommendation:** Add `<Dialog.Overlay>` with a backdrop CSS class.


#### P2-286. Next.js `start` rebuilds entire app on every invocation — primary source of timeout failures

- **Scope:** `apps/nextjs-app/package.json` (`"start": "next build && next start -p 3006"`)
- **Problem:** Every invocation of `npm start` runs `next build` (production compilation, 10–30+ seconds) before `next start`. All other apps' `start` scripts launch dev servers immediately. This means every CI test run and local dev session pays the full Next.js build cost. P2-264 and P3-164 track timeout issues for the crawler's webServer, but the root cause — the rebuild-on-start pattern — is never identified.
- **Impact:** Next.js cold-start in CI is 10–30+ seconds longer than other apps. This is the primary driver behind timeout failures tracked in P2-264/P3-164.
- **Recommendation:** Change to `"start": "next dev -p 3006"` for dev/CI consistency (matching pre-P2-87 state), add separate `"start:prod": "next build && next start -p 3006"` if production mode is needed.


#### P2-287. React and Next.js `@types/react` version divergence

- **Scope:** `apps/react-app/package.json` (`"@types/react": "~19.2.7"`), `apps/nextjs-app/package.json` (`"@types/react": "~19.2.14"`)
- **Problem:** Both apps use React 19.2 with MUI 7.3 and identical runtime stacks, but `@types/react` differs by 7 patch versions. Type definitions change between patches — added props, deprecated types, stricter generics.
- **Impact:** Silent type-level divergence. A fix applied to both apps might type-check in one but fail in the other.
- **Recommendation:** Align to the same `@types/react` version.


#### P2-288. Svelte `tsconfig.app.json` missing 4 esbuild-safety/strictness flags

- **Scope:** `apps/svelte-app/tsconfig.app.json`
- **Problem:** React and Vue `tsconfig.app.json` both include `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, and `verbatimModuleSyntax`. Svelte's `tsconfig.app.json` has none of these. P3-142 only covers `verbatimModuleSyntax` in `tsconfig.node.json` (not `.app.json`).
- **Impact:** `erasableSyntaxOnly` missing allows const enums and namespace-with-value declarations that compile with tsc but fail silently with esbuild. Other flags miss accidental switch fallthroughs, typos in CSS import paths, and missing `import type` enforcement.
- **Recommendation:** Add all four flags to match React/Vue conventions.


### P3 (Low)

#### P3-80. HTML `<title>` inconsistency across apps

- **Scope:** `apps/react-app/index.html`, `apps/angular-app/src/index.html`
- **Problem:** React uses `<title>react-app</title>`, Angular uses `<title>AngularApp</title>`. Other apps use the pattern "GeneralStore — [Framework]" (e.g., "GeneralStore — Vue", "GeneralStore — Svelte").
- **Impact:** Inconsistent browser tab names. Minor UI polish issue.
- **Recommendation:** Standardize all apps to "GeneralStore — [Framework]".


#### P3-87. Svelte flatpickr action may leak instance on reactive DOM re-creation

- **Scope:** `apps/svelte-app/src/pages/Home.svelte` — `useFlatpickr` action
- **Problem:** The Svelte action creates a flatpickr instance and registers a `destroy` callback. However, if Svelte's reactive updates remove and recreate the input DOM node (e.g., in an `{#if}` block), the old flatpickr instance may not be properly destroyed before the new one is created.
- **Impact:** Potential memory leak and duplicate calendar popups in edge cases.
- **Recommendation:** Verify the `destroy` callback fires on all Svelte re-render paths. Consider adding a guard to prevent double-initialization.


#### P3-117. Modal backdrop close behavior inconsistent — only vanilla-html supports it

- **Scope:** `apps/vanilla-html/app.js`, all other apps
- **Problem:** Only the vanilla-html app closes the modal on backdrop click (via `modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); })`). React (MUI Dialog), Vue (Vuetify v-dialog), Angular (MatDialog), Svelte (Bits UI Dialog), Next.js (MUI Dialog), and Lit all require the explicit Close button. §6.3 says "the close button or overlay click dismisses it" — implying backdrop click should work in all apps.
- **Impact:** The behavioral contract for modal dismissal differs across apps. Framework tests for backdrop click would pass on vanilla but fail on the other 6.
- **Recommendation:** Either implement backdrop close in all apps (MUI's `onClose`, Vuetify's `persistent` prop removal, Bits UI's `interactOutside` handler, etc.) or remove "overlay click" from the §6.3 specification and document that only the Close button is the universal dismissal mechanism.


#### P3-118. Vue `v-data-table` includes empty pagination slot — extra DOM not present in other apps

- **Scope:** `apps/vue-app/src/pages/Home.vue`
- **Problem:** `<template v-slot:bottom></template>` on the `v-data-table` renders Vuetify's default pagination footer area as an empty container. No other app has pagination-related DOM elements in the table area.
- **Impact:** Extra DOM elements may affect selectors that target the table's bottom boundary. Minor visual inconsistency.
- **Recommendation:** Verify the empty slot produces no visible DOM. If it does, style it to `display: none` or remove the slot override and use `:items-per-page="-1"` alone.


#### P3-137. Vue `formatDate` wrapper is unnecessary indirection

- **Scope:** `apps/vue-app/src/utils/formatDate.ts`
- **Problem:** The Vue app has a `formatDate(date: Date): string` utility that wraps `shared/logic.ts` `formatDate()` with identical signature and behavior. Other apps (React, Angular, Lit) import shared's `formatDate` directly. The Vue wrapper adds a layer of indirection with no additional behavior.
- **Impact:** Maintenance burden — changes to the shared function must be validated against the passthrough wrapper.
- **Recommendation:** Remove the Vue-specific wrapper and import from `@shared/logic` directly.


#### P3-142. Svelte `tsconfig.node.json` missing `verbatimModuleSyntax` — inconsistent with Vue/React/Lit

- **Scope:** `apps/svelte-app/tsconfig.node.json`
- **Problem:** Vue, React, and Lit all set `"verbatimModuleSyntax": true` in their tsconfig.node.json. Svelte's tsconfig.node.json omits it. This flag enforces explicit `import type` syntax for type-only imports.
- **Impact:** Type-only imports in Svelte config files not validated, inconsistent with project conventions.
- **Recommendation:** Add `"verbatimModuleSyntax": true`.


#### P3-143. Lit `tsconfig.json` has dead compiler options — `declaration` and `sourceMap` with `noEmit: true`

- **Scope:** `apps/lit-app/tsconfig.json`
- **Problem:** The config sets `"declaration": true, "sourceMap": true, "noEmit": true`. With `noEmit: true`, TypeScript doesn't produce output files, so `declaration` and `sourceMap` are dead options — they're checked syntactically but never used.
- **Impact:** Misleading config that suggests declaration files are generated when they're not.
- **Recommendation:** Remove `declaration` and `sourceMap` (Vite handles builds, not tsc).


#### P3-144. Lit `tsconfig.json` uses legacy `experimentalDecorators` — Lit 3.x supports standard decorators

- **Scope:** `apps/lit-app/tsconfig.json`
- **Problem:** The config has `"experimentalDecorators": true`. Lit 3.x works with both legacy and standard TC39 decorators. TypeScript 5.x supports standard decorators natively without any flag. Using the legacy flag means the project uses a deprecated path.
- **Impact:** Future TypeScript versions may drop `experimentalDecorators`. Prevents use of standard decorator features.
- **Recommendation:** Migrate to standard decorators by removing `experimentalDecorators` and replacing `@customElement()` with Lit's standard decorator variant.


#### P3-155. Lit README "Caveats & Deviations" doesn't mention nested shadow DOM from Shoelace components

- **Scope:** `apps/lit-app/README.md`
- **Problem:** The Lit app uses Shoelace components, which themselves use shadow DOM. This creates nested shadow DOM (Lit component shadow root → Shoelace component shadow root). The README's caveats section mentions shadow DOM but doesn't call out this nesting, which requires the framework's deep shadow-piercing selectors.
- **Impact:** Contributors debugging Lit-specific test failures won't know to look for double shadow boundaries.
- **Recommendation:** Add a caveat about nested shadow DOM and how the framework handles it.


#### P3-163. Toast CSS transitions inconsistent — only vanilla-html has fade animation

- **Scope:** `apps/vanilla-html/style.css`, `apps/react-app/src/App.css`, `apps/svelte-app/src/app.css`, `apps/angular-app/src/styles.css`, `apps/lit-app/src/pages/general-store-home.ts`
- **Problem:** The vanilla-html app's toast has `transition: opacity 0.3s` for smooth fade-in/fade-out. React, Angular, Svelte, and Lit apps' custom `<div class="toast">` implementations have no CSS transition or animation — the toast appears and disappears instantly. Vue and Next.js toasts similarly lack transitions. Only vanilla-html provides a polished toast experience.
- **Impact:** Visual inconsistency across apps. More importantly, tests that assert toast visibility timing (e.g., auto-dismiss after timeout) may behave differently across apps — the vanilla toast is still partially visible during its 300ms fade-out while other apps' toasts disappear instantly.
- **Recommendation:** Add `transition: opacity 0.3s ease` (or equivalent) to the `.toast` CSS class in all apps that use custom `<div>` toasts. Alternatively, document that transition behavior intentionally varies and adjust toast visibility assertions accordingly.


#### P3-170. Lit and Svelte apps missing `.gitignore` files

- **Scope:** `apps/lit-app/`, `apps/svelte-app/`
- **Problem:** Five of seven apps have local `.gitignore` files. Lit and Svelte apps rely solely on the root `.gitignore`. Framework-specific artifacts (`.vite/` cache, `tsconfig.tsbuildinfo`) are not explicitly excluded at the app level.
- **Impact:** Inconsistency across apps. If the root `.gitignore` changes, Lit and Svelte artifacts could be accidentally committed.
- **Recommendation:** Add `.gitignore` files matching the pattern used by `apps/react-app/.gitignore`.


#### P3-181. Cross-app toast persistence during navigation is inconsistent

- **Scope:** All 7 apps — toast behavior during page navigation
- **Problem:** Vanilla-html and Svelte apps persist the toast across in-app navigation (the toast `<div>` lives in a layout component). React, Next.js, Angular, and Vue destroy the toast when navigating away from Home (the toast is component-scoped state). Lit's behavior depends on the route change mechanism. There is no §6.6 requirement specifying toast persistence behavior during navigation.
- **Impact:** Cross-app navigation tests that trigger "Add to Cart" then navigate away see different toast behavior across apps. Not a bug per se, but an unspecified behavioral variance that tests must account for.
- **Recommendation:** Add a §6.6 requirement clarifying whether toast should persist across navigation. Then align all apps to the chosen behavior.


#### P3-195. Vue app README omits dialog framework choice — inconsistency with other app READMEs

- **Scope:** `apps/vue-app/README.md`
- **Problem:** The Vue README documents the app's technology stack and UI contract notes, but never mentions which dialog/modal component is used. REQUIREMENTS.md §6.7 specifies `<v-dialog>` (Vuetify) for Vue. All other app READMEs (React, Angular, Svelte, Lit) document their dialog/modal component library choices in their "UI Contract Notes" or "Caveats" sections. Vue's is missing.
- **Impact:** Onboarding friction — developers comparing app implementations can't immediately see what dialog component the Vue app uses. Breaks the consistency pattern across app READMEs. Distinct from P2-108 (which covers factual errors like "native `<select>`" claims); this is a missing section, not a stale one.
- **Recommendation:** Add a line to the Vue README's "UI Contract Notes" documenting Vuetify `<v-dialog>` usage for the product detail modal.


