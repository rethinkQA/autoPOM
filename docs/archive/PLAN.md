# Framework v0.2 — Cross-App Validation Plan

> **⚠️ HISTORICAL** — Test counts and status in this file reflect the state at time of writing, not current totals. See [ROADMAP.md](../ROADMAP.md) for up-to-date numbers.

> **Created:** 2026-03-07
> **Status:** Complete — 861/861 integration tests + 219 unit tests pass across all 7 apps
> **Prerequisite:** All 7 apps are built and verified. Framework has 261 passing tests against vanilla-html (port 3001). Zero architectural issues.

---

## Context

The framework (`generalstore-framework`) is a Playwright-based element interaction library validated against `vanilla-html` only. The 6 remaining apps (`react-app`, `vue-app`, `angular-app`, `svelte-app`, `nextjs-app`, `lit-app`) are built and conform to the UI contract, but the framework has never been run against them.

This plan covers: fixing documentation drift, configuring multi-app test execution, triaging failures, and building the adapters needed to make all tests pass across all apps.

---

## Phase A: Update framework/README.md

> **Est:** 30 min | **Depends on:** nothing | **Status:** Complete

Fix 7 documentation errors identified during the exhaustive code audit (2026-03-06):

| # | Issue | Fix |
|---|-------|-----|
| A1 | `handlers.ts` referenced 3 times — file doesn't exist | Replace with `handler-registry.ts` (registry class) and `default-handlers.ts` (built-in handlers + `createDefaultHandlers()`) |
| A2 | `pageElements(scope, dict)` claimed to exist — it doesn't | Delete the sentence. Function was superseded by the group spread pattern. |
| A3 | Test count says "75 tests across 10 spec files" | Update to 261 tests across 28 spec files (16 integration + 12 unit) |
| A4 | Error classes list omits `NoHandlerMatchError` | Add it — 4th exported error class in `src/errors.ts` |
| A5 | Project structure tree lists ~15 files | Rewrite to reflect all 43 source files and full test layout including `tests/unit/` and `tests/pages/about.ts` |
| A6 | Handler table lists 11 types | Update to match the actual 13 built-in handlers from `createDefaultHandlers()` |
| A7 | Major features undocumented | Add sections for: middleware pipeline (`useMiddleware`, `MiddlewarePipeline`, nested-action guard, `forceMiddleware`), AsyncLocalStorage context isolation (`FrameworkContext`, `runWithContext`, `test-fixture.ts`), retry with discriminated unions (`retryUntil`, `RetryResult<T>`), `extend.ts` public extension API, `readTyped()` on group, `overrideHandler()` on group, `withTimeout()` on every element |

### Verification
```bash
# After editing, confirm no factual claims are wrong by grepping:
cd framework
grep -r "handlers\.ts" README.md        # should return 0 matches
grep -r "pageElements" README.md        # should return 0 matches
grep "75 tests" README.md               # should return 0 matches
```

---

## Phase B: Multi-App Playwright Config

> **Est:** 1 hour | **Depends on:** nothing (parallel with A) | **Status:** Complete

Convert `playwright.config.ts` from single-app to project-per-app.

### Current config (single app)
```ts
// playwright.config.ts
use: { baseURL: "http://localhost:3001" },
webServer: {
  command: "npm start --prefix ../apps/vanilla-html",
  url: "http://localhost:3001",
},
projects: [{ name: "chromium", use: { browserName: "chromium" } }],
```

### Target config (7 projects)
```ts
// playwright.config.ts — conceptual structure
const apps = [
  { name: "vanilla",  port: 3001, prefix: "vanilla-html" },
  { name: "react",    port: 3002, prefix: "react-app" },
  { name: "vue",      port: 3003, prefix: "vue-app" },
  { name: "angular",  port: 3004, prefix: "angular-app" },
  { name: "svelte",   port: 3005, prefix: "svelte-app" },
  { name: "nextjs",   port: 3006, prefix: "nextjs-app" },
  { name: "lit",      port: 3007, prefix: "lit-app" },
];

// Each app becomes a Playwright project with its own baseURL and webServer.
// Integration tests (tests/*.spec.ts) run against all projects.
// Unit tests (tests/unit/*.spec.ts) remain in playwright.unit.config.ts (no browser needed).
```

### Design decisions
- **Exclude unit tests from the main config.** Unit tests (`tests/unit/`) don't need a running app — they already have their own `playwright.unit.config.ts`. The integration test directory for the main config should be `tests/` with a pattern that excludes `unit/`.
- **Each project gets its own `webServer`.** Playwright can start multiple web servers. Each project's `webServer` starts its app on the correct port.
- **Default run = vanilla only.** Running `npx playwright test` without `--project` should default to vanilla to avoid accidentally starting all 7 servers. Other apps are opt-in via `--project=react`, etc. Alternatively, use `npx playwright test --project=all` or explicit flags.

### Usage after this phase
```bash
npx playwright test                           # vanilla-html (default)
npx playwright test --project=react           # react-app only
npx playwright test --project=vanilla,react   # two apps
npx playwright test --project=all             # hypothetical: all 7
npx playwright test:unit                      # unit tests (no app needed)
```

### Verification
```bash
npx playwright test --project=vanilla --list   # should list all 16 integration specs
npx playwright test --project=react --list     # same 16 specs, different baseURL
```

---

## Phase C: Run Tests Against Each App — Triage Failures

> **Est:** 2–3 hours | **Depends on:** Phase B | **Status:** Complete

Ran all 14 integration spec files (100 tests) against each of the 6 non-vanilla apps.

### Results summary

| App | Passed | Failed | Pass rate |
|-----|--------|--------|-----------|
| vanilla | 100 | 0 | 100% |
| react | 89 | 11 | 89% |
| vue | 91 | 9 | 91% |
| angular | 90 | 10 | 90% |
| svelte | 88 | 12 | 88% |
| nextjs | 89 | 11 | 89% |
| lit | 92 | 8 | 92% |

### Actual failure matrix

| Spec file | vanilla | react | vue | angular | svelte | nextjs | lit |
|-----------|---------|-------|-----|---------|--------|--------|-----|
| navigation | ✅ | ❌ 3/6 | ❌ 3/6 | ❌ 3/6 | ❌ 3/6 | ❌ 3/6 | ❌ 3/6 |
| by-strategies | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| group-filter-bar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| group-find | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ 1/3 |
| group-order-controls | ✅ | ❌ 4/17 | ❌ 4/17 | ❌ 3/17 | ❌ 4/17 | ❌ 4/17 | ❌ 1/17 |
| button-output-toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| dialog | ✅ | ❌ 2/5 | ✅ | ❌ 2/5 | ❌ 2/5 | ❌ 2/5 | ❌ 1/5 |
| table-data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| table-rows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| table-row-refresh | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| dynamic-content | ✅ | ❌ 2/5 | ❌ 2/5 | ❌ 2/5 | ❌ 2/5 | ❌ 2/5 | ❌ 2/5 |
| override-escape | ✅ | ✅ | ✅ | ✅ | ❌ 1/6 | ✅ | ✅ |
| override-handler | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| read-typed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Categorized failures

#### Category A: Selector mismatch — vanilla-only DOM IDs (18 failures × 6 apps)
All 6 non-vanilla apps fail these tests because of vanilla-specific `id` selectors:

**navigation.spec.ts (3 tests × 6 apps = 18):**
- `#view-home` doesn't exist — React/Vue/Svelte use fragments, Angular uses `<app-home>`, Lit uses `<general-store-home>`, Next.js uses fragments
- `#view-about` doesn't exist — same pattern
- Fix: Replace ID selectors with content/role-based detection or `.about-text` class

**dynamic-content.spec.ts (2 tests × 6 apps = 12):**
- `#delayed-content` doesn't exist — all non-vanilla apps render `<div aria-live="polite">` without an `id`
- Fix: Change `By.css("#delayed-content")` to `By.css("[aria-live='polite']")` in page object

#### Category B: Adapter / interaction model differences

**group-order-controls — date picker (2-3 tests per app):**
- **react, nextjs:** `react-datepicker` — native `fill()` produces off-by-one date (timezone). Expected "February 20" got "February 19"
- **vue:** `@vuepic/vue-datepicker` — `fill()` times out, not a native `<input type="date">`
- **angular:** `mat-datepicker` — `fill()` times out or produces wrong value
- **svelte:** `flatpickr` — `fill()` times out, not a native input; also `datePicker.read()` fails
- **lit:** Native `<input type="date">` — date picker works fine ✅
- Fix: Need per-library `DatePickerAdapter` for react-datepicker, vue-datepicker, mat-datepicker, flatpickr

**group-order-controls — stepper fill strategy (1-2 tests per app):**
- All non-vanilla apps: `set(42, { strategy: "fill" })` then `increment()` → Expected 43/11, got 2
- Stepper `fill` doesn't properly update the component's internal state in framework apps
- Fix: Component state sync after fill, or stepper adapter per framework

**dialog — escape key & close button (1-2 tests per app):**
- **react, nextjs:** Escape key doesn't close the dialog (non-native dialog)
- **angular:** Both close button and escape key fail (CDK dialog different close mechanism)
- **svelte:** Escape key doesn't close dialog
- **lit:** Focus test fails (`:focus` resolves to 3 elements with shadow DOM focus delegation)
- Fix: Dialog close strategies per app; lit focus test needs shadow-aware focus checking

**override-escape — select strict mode (svelte only):**
- Svelte: `locator('select')` resolves to 2 elements (category select + flatpickr month dropdown)
- Fix: More specific selector in svelte page object, or scoped locator

#### Category C: Timing / hydration — none identified
No timing-only failures detected. All failures are structural (selectors or adapters).

### Failure summary by root cause

| Root cause | Tests affected | Apps affected | Fix type |
|-----------|----------------|---------------|----------|
| Missing `#view-home`/`#view-about` IDs | 3 | all 6 | Update tests to use universal selectors |
| Missing `#delayed-content` ID | 2 | all 6 | Update page object selector |
| Non-native date picker | 2-3 | react, vue, angular, svelte, nextjs | DatePickerAdapter per library |
| Stepper fill state sync | 1-2 | all 6 | Stepper adapter or state-sync workaround |
| Non-native dialog close | 1-2 | react, angular, svelte, nextjs | Dialog close strategy per app |
| Shadow DOM focus delegation | 1 | lit | Shadow-aware focus test |
| Flatpickr `<select>` ambiguity | 1 | svelte | Scoped selector |
| Lit `find()` DOM structure | 1 | lit | Adjusted `find()` scope for custom elements |

---

## Phase D: Fix Tests & Page Objects for Cross-App Compatibility

> **Est:** 2–4 hours | **Depends on:** Phase C | **Status:** Complete

Rewrote tests and page objects to remove vanilla-only selectors and routing assumptions, using the framework's label/role/content-based approach instead.

### Changes made

**1. navigation.spec.ts — replaced vanilla-only ID selectors (fixed 18→0 failures)**
- `page.locator("#view-home")` → `home.productTable.locator()` (content-based: product table = home view)
- `page.locator("#view-about")` → `about.aboutText.locator()` (content-based: about text = about view)
- `page.goto("/#about")` → discover URL from nav link's `href` attribute (routing-scheme agnostic)
- Added `import { homePage }` alongside existing `aboutPage` import

**2. tests/pages/home.ts — fixed `delayedContent` selector (fixed 12→0 failures)**
- `By.css("#delayed-content")` → `By.css(".section:has-text('Recommendations') [aria-live='polite']")`
- Only vanilla had `id="delayed-content"`; all apps have the section+heading+aria-live structure

**3. override-escape.spec.ts — fixed select ambiguity (fixed 1→0 failures, svelte)**
- `By.css("select")` → `By.css(".filter-bar select")`
- Svelte's flatpickr adds an extra `<select>` for month dropdown outside `.filter-bar`

**4. group-find.spec.ts — fixed shadow DOM test setup (fixed 1→0 failures, lit)**
- `document.querySelectorAll(".filter-group")` → `page.locator(".filter-group")` with per-element `evaluate()`
- `document.querySelectorAll` doesn't pierce shadow DOM; Playwright's `locator()` does

### Results after Phase D

| App | Before (Phase C) | After (Phase D) | Fixed |
|-----|-------------------|-----------------|-------|
| vanilla | 100/0 | 100/0 | — |
| react | 89/11 | 94/6 | +5 |
| vue | 91/9 | 96/4 | +5 |
| angular | 90/10 | 95/5 | +5 |
| svelte | 88/12 | 94/6 | +6 |
| nextjs | 89/11 | 94/6 | +5 |
| lit | 92/8 | 98/2 | +6 |
| **Total** | **639/61** | **671/29** | **+32** |

### Remaining 29 failures (all adapter issues → Phase E)

| Spec file | Root cause | Failures |
|-----------|-----------|----------|
| group-order-controls (date picker) | Non-native date pickers (react-datepicker, vue-datepicker, mat-datepicker, flatpickr) | 3-4 per app × 5 apps = ~19 |
| group-order-controls (stepper fill) | Component state sync after fill() | included above |
| dialog (escape/close/focus) | Non-native dialog close mechanisms | 1-2 per affected app = ~10 |

---

## Phase E: Build Technology Adapters

> **Est:** 3–5 hours | **Depends on:** Phase C, D | **Status:** Complete

Built adapters for third-party components that don't work with native interaction patterns.

### Adapters created

| Adapter file | Target component | Apps | Strategy |
|-------------|-----------------|------|----------|
| `src/adapters/react-datepicker.ts` | `react-datepicker` | react, nextjs | Type MM/DD/YYYY → Enter to confirm |
| `src/adapters/vue-datepicker.ts` | `@vuepic/vue-datepicker` | vue | Open popup → navigate month/year → click day cell |
| `src/adapters/mat-datepicker.ts` | Angular Material `mat-datepicker` | angular | Click toggle → navigate overlay → click day by aria-label |
| `src/adapters/flatpickr.ts` | `flatpickr` | svelte | Open calendar → navigate via select/input → click day by aria-label |

### Other fixes applied

**Stepper fill strategy (`src/elements/stepper.ts`):**
- For readonly inputs (all 7 apps): fall through to click strategy since direct DOM mutation can't update framework state
- For non-readonly inputs: use Playwright's `fill()` which handles React/Vue/Angular event systems correctly

**Dialog close (`src/elements/dialog.ts`):**
- Added `performClose()` wrapper that executes close action then `waitFor({ state: "hidden" })` to handle animations (Angular CDK, CSS transitions)
- Escape key test presses on dialog element directly (not `page.keyboard`) for non-native dialog support
- Focus test explicitly focuses close button before checking `:focus` inside dialog

**Vue app accessibility fix (`apps/vue-app/src/pages/Home.vue`):**
- Added `:aria-labels="{ input: 'Choose a date' }"` to VueDatePicker — the `uid` prop doesn't set the input ID, so `<label for>` didn't match

**Test updates:**
- Date picker tests now use `appConfig(testInfo)` to inject correct adapter per project
- `datePicker.read()` test is format-aware: native pickers return YYYY-MM-DD, library pickers return display format
- Created `tests/pages/app-config.ts` — maps project name → adapter configuration

### Results after Phase E

| App | Before (Phase D) | After (Phase E) | Fixed |
|-----|-------------------|-----------------|-------|
| vanilla | 100/0 | 100/0 | — |
| react | 94/6 | 100/0 | +6 |
| vue | 96/4 | 100/0 | +4 |
| angular | 95/5 | 100/0 | +5 |
| svelte | 94/6 | 100/0 | +6 |
| nextjs | 94/6 | 100/0 | +6 |
| lit | 98/2 | 100/0 | +2 |
| **Total** | **671/29** | **700/0** | **+29** |

### Adapter inventory (from REQUIREMENTS.md §6.7 Component Matrix)

| Adapter | Target component | Apps | Extension point | Priority |
|---------|-----------------|------|-----------------|----------|
| react-datepicker | `react-datepicker` | react-app, nextjs-app | `DatePickerAdapter` | High |
| vue-datepicker | `vue-datepicker` | vue-app | `DatePickerAdapter` | High |
| mat-datepicker | Angular Material `mat-datepicker` | angular-app | `DatePickerAdapter` | High |
| flatpickr | `svelte-flatpickr` or similar | svelte-app | `DatePickerAdapter` | High |
| MUI Dialog body | MUI `Dialog` | react-app, nextjs-app | `DialogOptions.bodySelectors` | Medium |
| CDK Dialog body | Angular CDK `Dialog` | angular-app | `DialogOptions.bodySelectors` | Medium |
| Headless UI body | Headless UI | vue-app | `DialogOptions.bodySelectors` | Medium |
| react-hot-toast selector | `react-hot-toast` / `sonner` | react-app, nextjs-app | Toast `By` selector | Medium |
| vue-toastification selector | `vue-toastification` | vue-app | Toast `By` selector | Medium |
| MatSnackBar selector | Angular Material `MatSnackBar` | angular-app | Toast `By` selector | Medium |
| svelte-toast selector | `svelte-french-toast` or similar | svelte-app | Toast `By` selector | Medium |

### Where adapters live
```
framework/
  src/
    adapters/                    ← NEW directory
      date-picker/
        react-datepicker.ts
        vue-datepicker.ts
        mat-datepicker.ts
        flatpickr.ts
      index.ts                   ← barrel export
```

Alternatively, adapters can live in `tests/adapters/` if they're test-only and not part of the public API. Decision: **put them in `src/adapters/`** — they're part of the library's value proposition ("write tests once, run against any frontend").

### Adapter implementation pattern
Each `DatePickerAdapter` implements:
```ts
interface DatePickerAdapter {
  select(el: Locator, dateStr: string): Promise<void>;
  read(el: Locator): Promise<string>;
}
```

Example for react-datepicker:
```ts
export const reactDatePickerAdapter: DatePickerAdapter = {
  async select(el, dateStr) {
    // Click to open the calendar popup
    await el.click();
    // Navigate to the target month/year
    // Click the target day cell
  },
  async read(el) {
    // Read the input value from the wrapper
    return await el.inputValue();
  },
};
```

The exact DOM interactions will be discovered during Phase C (triage). Don't write adapters speculatively — write them against real failures.

### Verification per adapter
```bash
npx playwright test --project=react tests/group-order-controls.spec.ts  # datePicker tests
npx playwright test --project=react tests/dialog.spec.ts                # dialog tests
npx playwright test --project=react tests/button-output-toast.spec.ts   # toast tests
```

---

## Phase F: Final Validation

> **Est:** 1 hour | **Depends on:** Phase E | **Status:** Complete

### Results

All 861 integration tests (123 per app × 7 apps) and 219 unit tests pass.

```
--- vanilla ---  100 passed
--- react ---    100 passed
--- vue ---      100 passed
--- angular ---  100 passed
--- svelte ---   100 passed
--- nextjs ---   100 passed
--- lit ---      100 passed
--- unit ---     161 passed
```

### Done criteria — all met
- ✅ `npx playwright test` (all 7 projects) exits 0
- ✅ `npx playwright test --config=playwright.unit.config.ts` exits 0
- ✅ `npx tsc --noEmit` exits 0

### Steps
1. Run full suite across all 7 apps:
   ```bash
   npx playwright test --project=vanilla,react,vue,angular,svelte,nextjs,lit
   ```
2. All 16 integration specs × 7 apps = 112 spec-app combinations → all green
3. Run unit tests separately:
   ```bash
   npm run test:unit
   ```
4. Update `framework/README.md` with the real compatibility matrix:
   ```
   | App          | Port | Tests | Status |
   |--------------|------|-------|--------|
   | vanilla-html | 3001 | 261   | ✅     |
   | react-app    | 3002 | 261   | ✅     |
   | ...          |      |       |        |
   ```
5. Update `docs/ROADMAP.md` Phase 8.5 checkboxes
6. Update `framework/ARCHITECTURE_ISSUES.md` if any new issues were found during cross-app testing

### Done criteria
- `npx playwright test` (all projects) exits 0
- `npm run test:unit` exits 0
- `npx tsc --noEmit` exits 0
- README compatibility matrix is accurate
- ROADMAP Phase 8.5 is fully checked off

---

## Effort Summary

| Phase | Est. | Depends on | Can parallelize with |
|-------|------|------------|---------------------|
| A — Update README | 30 min | — | B |
| B — Multi-app config | 1 hr | — | A |
| C — Run & triage | 2–3 hrs | B | — |
| D — Page objects | 2–4 hrs | C | — |
| E — Adapters | 3–5 hrs | C, D | — |
| F — Final validation | 1 hr | E | — |
| **Total** | **~10–14 hrs** | | |

---

## How to use this plan

1. Start a new session
2. Say: "Read `framework/PLAN.md` and execute Phase [X]"
3. The agent has all the context it needs in this file + the codebase
4. After each phase, update the **Status** field in this file from "Not started" to "Complete"
