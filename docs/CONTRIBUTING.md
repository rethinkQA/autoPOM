# Contributing

> Quick-start guide for new contributors. For full requirements see [REQUIREMENTS.md](REQUIREMENTS.md). For implementation history see [archive/](archive/).

---

## Project Structure

```
test_app/
├── apps/                    ← 7 minimal web apps (test targets)
│   ├── vanilla-html/        ← Reference implementation (plain HTML/CSS/JS)
│   ├── react-app/           ← React 19 + MUI (Vite, port 3002)
│   ├── vue-app/             ← Vue 3.5 + Vuetify (Vite, port 3003)
│   ├── angular-app/         ← Angular 19 + Angular Material (port 3004)
│   ├── svelte-app/          ← Svelte 5 + Bits UI (Vite, port 3005)
│   ├── nextjs-app/          ← Next.js 16 + MUI (port 3006)
│   └── lit-app/             ← Lit 3 + Shoelace (Vite, port 3007)
├── framework/               ← Playwright element interaction library
│   ├── src/                 ← By, handler registry, group, typed wrappers, adapters
│   └── tests/               ← 1,064 integration + 276 unit tests
├── tools/crawler/           ← Runtime page crawler + page object emitter
├── shared/                  ← Shared data & logic (TypeScript)
├── docs/                    ← Requirements, roadmap, this file
│   └── archive/             ← Completed historical docs
└── package.json             ← Root: start:all script
```

---

## Prerequisites

- **Node ≥20.19** (see `.nvmrc`) — Vite 7 requires Node 20.19+; earlier 20.x versions will fail to build Vite-based apps
- npm (comes with Node)

```bash
nvm use   # if using nvm
```

---

## First-Time Setup

From the repository root:

```bash
npm install            # Root dependencies (concurrently)
npm run install:all    # All 7 apps + framework + crawler
```

This installs dependencies in: `apps/vanilla-html`, `apps/react-app`, `apps/vue-app`, `apps/angular-app`, `apps/svelte-app`, `apps/nextjs-app`, `apps/lit-app`, `framework`, and `tools/crawler`.

---

## Running Apps

```bash
# Single app
cd apps/vanilla-html && npm start     # → http://localhost:3001

# All 7 apps at once (from repo root)
npm run start:all
```

| App | Port |
|-----|------|
| vanilla-html | 3001 |
| react-app | 3002 |
| vue-app | 3003 |
| angular-app | 3004 |
| svelte-app | 3005 |
| nextjs-app | 3006 |
| lit-app | 3007 |

### Port Conflicts

If a port is already in use, check what process owns it and kill it or choose a different port:

```bash
# Find the process using a port (e.g. 3001)
lsof -i :3001

# Kill it by PID
kill <PID>
```

Vite apps (`react`, `vue`, `svelte`, `lit`) are configured with `strictPort: true` so they fail loudly rather than silently picking another port. Angular and Next.js also use fixed ports. If you need to override a port for local development, edit the `start` script in the relevant `apps/<name>/package.json`.

---

## Running Tests

All tests are run from the `framework/` directory. The test runner auto-starts each app's dev server.

```bash
cd framework

# Run all tests (all 7 apps)
npx playwright test

# Run tests for a single app
npx playwright test --project=vanilla
npx playwright test --project=react
npx playwright test --project=vue

# Run a specific test file
npx playwright test tests/navigation.spec.ts

# Run a specific test file against a specific app
npx playwright test --project=angular tests/dialog.spec.ts

# Unit tests only
npx playwright test --config=playwright.unit.config.ts

# Interactive UI mode
npx playwright test --ui

# Type-check without running
npx tsc --noEmit
```

### Crawler Tests

```bash
cd tools/crawler
npx playwright test                    # All crawler tests
npx playwright test tests/validation.spec.ts   # Structural validation
```

### Verifying Test Counts in Docs

Hardcoded test counts appear in several docs. After adding or removing tests, verify they're still accurate:

```bash
# From repo root
npm run test:counts          # print actual counts and compare to docs
npm run test:counts:check    # exit 1 if any doc is stale (CI-friendly)
npm run test:counts:update   # patch all docs in place with current counts
```

---

## Adding a New App

1. Create `apps/<name>/` with a `package.json` containing a `start` script
2. Assign the next available port (currently 3008)
3. Implement the GeneralStore UI contract — see [REQUIREMENTS.md §6](REQUIREMENTS.md) for the full element specification
4. Use `apps/vanilla-html/` as the behavioral reference
5. Add the app definition to `shared/apps.ts` (name, port, prefix) — both `framework/playwright.config.ts` and `tools/crawler/playwright.config.ts` auto-generate project entries from this file
6. Add the app's install directory to `scripts/install-apps.mjs`
7. Run framework tests against the new app: `npx playwright test --project=<name>`
8. Fix failures by adding adapters (date picker, dialog, select) if the app uses non-native components
9. Update the root `README.md` app catalog
10. Update `.github/workflows/ci.yml` if the new app requires additional setup

---

## Extending the Framework

The framework lives in `framework/src/`. Key extension points:

- **New element handler:** Add to the `handlers` array in `src/default-handlers.ts`. Detection rules, `set()`, and `get()` — everything else adapts automatically.
- **New typed wrapper:** Create a file in `src/elements/`, export from `src/index.ts`.
- **New adapter:** Create in `src/adapters/` (e.g., date picker or select adapter for a new component library).
- **Middleware:** Use `useMiddleware()` — see `src/network-settle-middleware.ts` for an example.

See [`framework/README.md`](../framework/README.md) for full API documentation.

---

## Key Conventions

- **Semantic identification only** — elements are identified by semantic HTML, ARIA attributes, CSS classes, and labels. No `data-testid`.
- **Behavioral contract** — all apps must produce the same user-visible outcomes (filter results, sort order, toast text). DOM structure will differ — that's the point.
- **No runtime network requests** — all libraries bundled locally. Async behavior uses `setTimeout`/`Promise`.
- **Lockfiles committed** — every `package-lock.json` is checked in for reproducible installs.

---

## Known Constraints

- **TypeScript version:** Angular 19.2 enforces TypeScript <5.9. The `angular-app` is pinned at `~5.8.3` while all other packages use `~5.9.3`. **Shared code in `shared/` must avoid TS 5.9+ syntax features** (e.g. satisfies in new positions, config-file features) to maintain compatibility across all 7 apps. This constraint lifts when Angular upgrades to v20 (expected Q3 2026 based on Angular's 6-month major release cadence). Re-evaluate after each Angular major release.
- **Dependency pinning:** All dependencies use tilde (`~`) ranges, not caret (`^`), per §7.5 of REQUIREMENTS.md. When adding or upgrading packages, use `~x.y.z`.
- **Timeout constants:** All timeout and retry values should be defined in `framework/src/timeouts.ts`. Do not add new magic numbers in other files.

---

## Release Strategy

Both `@playwright-elements/core` and `@playwright-elements/crawler` are at **v0.1.0** with `"private": true` in their `package.json` files. This means `npm publish` is blocked and there is no public npm distribution.

**Current status:** Internal use only. The packages are consumed via npm workspaces within this repository.

**When ready to publish:**

1. **Remove `"private": true`** from `framework/package.json` and/or `tools/crawler/package.json`.
2. **Versioning:** Follow [semver](https://semver.org/). While at `0.x`, breaking changes bump the minor version. After `1.0.0`, breaking changes bump the major version.
3. **Changelog:** Create `CHANGELOG.md` in each package root. Use [Keep a Changelog](https://keepachangelog.com/) format. Document all user-facing changes per release.
4. **Pre-publish checklist:**
   - All tests pass (`npx playwright test` in both `framework/` and `tools/crawler/`)
   - `tsc --noEmit` clean
   - `npm run lint` and `npm run format:check` pass
   - Version bumped in `package.json`
   - `CHANGELOG.md` updated
5. **Publish:** `cd framework && npm publish` (or `cd tools/crawler && npm publish`).
6. **Tag:** `git tag v<version>` and push: `git push origin v<version>`.

---

## Documentation Map

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview, app catalog, quick start |
| [docs/REQUIREMENTS.md](REQUIREMENTS.md) | Goals, architecture, UI contract, conventions |
| [docs/ROADMAP.md](ROADMAP.md) | Phase summary table + open phases |
| [docs/CONTRIBUTING.md](CONTRIBUTING.md) | This file — onboarding guide |
| [framework/README.md](../framework/README.md) | Framework API documentation |
| [framework/docs/api/](../framework/docs/api/) | Generated TypeDoc API reference (`cd framework && npm run docs`) |
| [tools/crawler/README.md](../tools/crawler/README.md) | Crawler & emitter documentation |
| [docs/archive/](archive/) | Historical docs (completed checklists, closed issues, superseded reviews) |
