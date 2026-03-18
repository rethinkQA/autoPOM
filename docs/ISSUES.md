# Project Issues Tracker

> **Created:** 2026-03-18
> **Source:** Critical analysis of documentation, codebase, and roadmap
> **Last updated:** 2026-03-18

## Summary

| Priority | Open | Closed |
|----------|------|--------|
| 🔴 P0    | 0    | 1      |
| 🟡 P1    | 0    | 3      |
| 🟢 P2    | 1    | 2      |
| ⚪ P3    | 0    | 1      |
| 🔵 Deferred | 2 | 0    |
| **Total** | **3** | **7** |

---

## Open Issues

### ✅ ~~P0-1. Documentation is 4,000+ lines with no onboarding path — consolidate and archive~~ — RESOLVED

- **Scope:** `docs/`, `framework/`
- **Resolution (2026-03-18):**
  1. Created `docs/archive/` and moved `REVIEW_SYNTHESIS.md`, `PLAN.md`, `ARCHITECTURE_ISSUES.md` there
  2. Trimmed `ROADMAP.md` from 959→95 lines — completed phases collapsed into summary table, only Phase 14 remains as forward-looking
  3. Saved full historical roadmap as `docs/archive/ROADMAP-full.md`
  4. Replaced §11 in `REQUIREMENTS.md` (~340 lines) with a link to `framework/README.md`
  5. Created `docs/CONTRIBUTING.md` (~155 lines): project structure, setup, running apps/tests, adding apps, extending framework
  6. Updated root `README.md` documentation section with table linking to all current docs
- **Result:** Active docs reduced from ~4,000 lines across 5 files to ~1,600 lines across 4 files. New contributors start at `docs/CONTRIBUTING.md`.

---

### ✅ ~~P1-1. No workspace-level bootstrap — first-run DX is broken~~ — RESOLVED

- **Scope:** Root `package.json`, all 7 app `package.json` files
- **Resolution (2026-03-18):**
  1. Added `install:all` script to root `package.json` — installs all 7 apps + framework + crawler in one command
  2. Updated root `README.md` quick-start to: `npm install && npm run install:all && npm run start:all`
  3. Updated `docs/CONTRIBUTING.md` first-time setup to use `npm run install:all`
- **Result:** Fresh clone bootstrap is now two commands from repo root: `npm install && npm run install:all`

---

### ✅ ~~P1-2. Vanilla HTML can't import shared data/logic — silent divergence risk~~ — RESOLVED

- **Scope:** `apps/vanilla-html/app.js`, `shared/data.ts`, `shared/logic.ts`
- **Resolution (2026-03-18):** Used option A (pre-build script with esbuild).
  1. Created `scripts/generate-vanilla-shared.mjs` — bundles `shared/data.ts` + `shared/logic.ts` into an IIFE (`window.Shared`) via esbuild
  2. Updated `apps/vanilla-html/app.js` — removed all inline data/logic copies; now destructures from `Shared` (e.g. `PRODUCTS`, `filterAndSortProducts`, `cartMessage`, `formatDate`, `TOAST_DURATION_MS`)
  3. Updated `apps/vanilla-html/index.html` — loads `shared.js` before `app.js`
  4. Updated `apps/vanilla-html/package.json` — added `generate-shared` + `prestart` scripts so `shared.js` is regenerated on every `npm start`
  5. Added `apps/vanilla-html/.gitignore` — ignores the generated `shared.js`
  6. Updated root `package.json` — added `generate-shared` script; `start:all` runs it before launching apps
  7. Updated `shared/logic.ts` doc comment to reflect the new approach
  8. Fixed `functional-swap.spec.ts` test — was passing a string to a radio handler that expects boolean
- **Result:** Vanilla-html now consumes the canonical shared sources automatically. Any edit to `shared/data.ts` or `shared/logic.ts` propagates on next `npm start`. All 132 vanilla Playwright tests pass.

---

### ✅ ~~P1-3. No linting or formatting enforcement~~ — RESOLVED

- **Scope:** Project-wide
- **Resolution (2026-03-18):**
  1. Added `.editorconfig` — indent size, line endings, trailing whitespace, final newline
  2. Added `prettier.config.mjs` + `.prettierignore` — shared formatting rules (semi, double quotes, trailing commas, 100 char width)
  3. Added `eslint.config.mjs` (ESLint flat config) — `@eslint/js` recommended + `typescript-eslint` recommended for TS files. Apps with their own configs (react-app, nextjs-app) are excluded from root lint.
  4. Added root scripts: `lint`, `lint:fix`, `format`, `format:check`
  5. Installed devDependencies: `prettier`, `eslint`, `@eslint/js`, `typescript-eslint`, `globals`
- **Result:** `npm run lint` finds 42 real issues (12 errors, 30 warnings). `npm run format:check` flags 160 files. Pre-commit hooks (husky/lint-staged) deferred — can be added incrementally.

---

### ✅ ~~P2-1. Lit app is the only un-decomposed monolith~~ — RESOLVED

- **Scope:** `apps/lit-app/src/`
- **Resolution (2026-03-18):**
  1. Decomposed the 694-line monolithic `general-store-home.ts` into a coordinator page (~250 lines) plus three sub-components
  2. Created `src/components/` directory with `general-store-filter-bar.ts`, `general-store-product-table.ts`, `general-store-order-controls.ts` (dialog and toast also moved here)
  3. Created `src/pages/` directory with `general-store-home.ts` and `general-store-about.ts`, matching the React/Vue/Angular/Svelte pattern
  4. Sub-components render to light DOM so they share the parent shadow root's styles — preserves the same DOM depth for the test framework
  5. Verified: `vite build` clean, `tsc --noEmit` clean, 125 Lit integration tests pass (1 pre-existing Shoelace radio failure unchanged)
- **Result:** Lit app now follows the same decomposed architecture as all other apps

---

### ✅ ~~P2-2. Phase 14 (Source Scan) — decide or cut~~ — RESOLVED

- **Scope:** `docs/ROADMAP.md` Phase 14 section
- **Resolution (2026-03-18):**
  1. Removed Phase 14 (Source Scan Enrichment) from `ROADMAP.md` — all three levels (guided grep, conditional detection, component library ID) cut
  2. The crawler + emitter already produce usable page objects without source scanning; the feature had no spec, no acceptance criteria, and no tests defined
  3. Full historical Phase 14 description preserved in `docs/archive/ROADMAP-full.md`
- **Result:** Considered and deferred indefinitely. ROADMAP.md now shows all phases complete.

---

### ✅ ~~P2-3. Framework and crawler are disconnected packages — no workspace linking~~ — RESOLVED

- **Scope:** `framework/package.json`, `tools/crawler/package.json`, root `package.json`
- **Resolution (2026-03-18):**
  1. Added `"workspaces": ["framework", "tools/crawler"]` to root `package.json`
  2. Root `npm install` now hoists shared deps (`@playwright/test`, `@types/node`, `typescript`) and creates symlinks at `node_modules/@playwright-elements/{core,crawler}`
  3. Removed `framework` and `tools/crawler` from the `install:all` loop — workspace `npm install` handles them
  4. Apps kept out of workspaces (intentionally different dep trees)
  5. `shared/` left as-is — apps already import via `@shared/*` path aliases in their bundler/tsconfig configs; no npm package needed
- **Result:** Shared deps deduped, single lockfile at root governs framework + crawler versions. `npm run build -w framework` and `npm run build -w @playwright-elements/crawler` work from repo root. All 219 framework unit tests + 77 crawler unit tests pass.

---

### ✅ ~~P3-1. Test count documentation has no automated verification~~ — RESOLVED

- **Scope:** `README.md`, `framework/README.md`, `docs/ROADMAP.md`, `docs/CONTRIBUTING.md`
- **Resolution (2026-03-18):**
  1. Created `scripts/verify-test-counts.mjs` — runs `playwright test --list` for all 4 test suites (framework integration/unit, crawler integration/unit), parses counts, and compares to 12 hardcoded locations across 4 docs
  2. Three modes: default (print counts), `--check` (exit 1 if stale — CI-friendly), `--update` (patch docs in place)
  3. Added root scripts: `test:counts`, `test:counts:check`, `test:counts:update`
  4. Added "Verifying Test Counts in Docs" section to `docs/CONTRIBUTING.md`
- **Result:** `npm run test:counts:check` can gate CI. `npm run test:counts:update` auto-patches all docs after adding/removing tests. No more manual count maintenance.

---

## Deferred Issues

### 🔵 Deferred-1. CI/CD pipeline — deferred until deployment planning

- **Scope:** Project-wide
- **Original priority:** P0
- **Reason deferred:** Owner wants to complete manual testing and stabilization before formalizing CI/CD. Will revisit when ready for official deployment.
- **Details:**
  - No GitHub Actions (or equivalent) workflow exists
  - No automated build step (`npx tsc`) for framework or crawler
  - No automated test run for integration or unit tests
  - No lint check
  - The framework claims 1,143 passing tests; the crawler claims 945 — neither is verified in CI
- **Fix (when ready):**
  1. Create `.github/workflows/ci.yml` with jobs: install → build → lint → test (framework) → test (crawler)
  2. Framework job: `cd framework && npx tsc --noEmit && npx playwright test && npx playwright test --config=playwright.unit.config.ts`
  3. Crawler job: `cd tools/crawler && npx tsc --noEmit && npx playwright test && npx playwright test --config=playwright.unit.config.ts`
  4. Use Playwright's built-in `webServer` config to auto-start apps (already configured)
  5. Cache `node_modules` per package
- **Effort:** ~4 hours
- **Blocked by:** P3-2 depends on this

---

### 🔵 Deferred-2. Cross-browser testing is gated behind env var — invisible in normal dev

- **Scope:** `framework/playwright.config.ts`
- **Original priority:** P3
- **Reason deferred:** Depends on CI pipeline (Deferred-1). Cross-browser config already exists behind `BROWSERS` env var — no urgency until CI is set up.
- **Fix (when ready):** Add a `test:cross-browser` npm script or CI nightly job running `BROWSERS=firefox,webkit npx playwright test`
- **Effort:** ~1 hour
- **Depends on:** Deferred-1 (CI)

---

## Closed Issues

_(none yet)_

---

## How to Use This File

- **Claim an issue:** Add your name/date to the issue header
- **Close an issue:** Move it to "Closed Issues" with date and brief resolution note
- **Add an issue:** Append to "Open Issues" with next number, follow the format above
- **Priority legend:** 🔴 P0 = do first, 🟡 P1 = do next, 🟢 P2 = schedule, ⚪ P3 = backlog, 🔵 Deferred = parked until explicitly revisited
