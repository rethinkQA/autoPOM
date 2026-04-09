# Test Target Application Library

[![CI](https://github.com/AaronJessen/playwright-elements/actions/workflows/ci.yml/badge.svg)](https://github.com/AaronJessen/playwright-elements/actions/workflows/ci.yml)

> **GeneralStore** — A collection of minimal web apps implementing a fictional storefront, built with different frontend technologies. These apps serve as stable, predictable test targets for a standardized Playwright-based testing framework.

---

## Quick Start

```bash
# Prerequisites
node -v   # Must be Node 20 LTS (see .nvmrc)
nvm use   # If using nvm

# Install everything (root + all 7 apps + framework + crawler)
npm install && npm run install:all

# Start all apps simultaneously
npm run start:all

# Or start a single app
cd apps/vanilla-html && npm start
```

> **Troubleshooting:** All commands above must be run from the repository root (`test_app/`). If you see `concurrently: command not found`, run `npm install` at the repo root first.

---

## App Catalog

| App | Technology | Port | Start Command | Status |
|-----|-----------|------|---------------|--------|
| `vanilla-html` | HTML / CSS / JS (no framework) | 3001 | `npx serve -l 3001` | ✅ Done |
| `react-app` | React 19 + TypeScript (Vite 7) | 3002 | `vite --port 3002` | ✅ Done |
| `vue-app` | Vue 3.5 + TypeScript (Vite 7) | 3003 | `vite --port 3003` | ✅ Done |
| `angular-app` | Angular 19 (Angular CLI) | 3004 | `ng serve --port 3004` | ✅ Done |
| `svelte-app` | Svelte 5+ (Vite 7) | 3005 | `vite --port 3005` | ✅ Done |
| `nextjs-app` | Next.js 16 (SSR, App Router) | 3006 | `next dev -p 3006` | ✅ Done |
| `lit-app` | Lit 3 (Web Components, Vite 7) | 3007 | `vite --port 3007` | ✅ Done |

> **HTMX deferred:** An `htmx-app` was originally planned but deferred from v0.1. The 7 apps above provide sufficient technology diversity.

### Implementation Notes

- **Vanilla HTML:** Reference implementation — plain HTML/CSS/JS, native `<dialog>`, native `<input type="date">`, hash-based routing. All elements identified by semantic HTML, ARIA attributes, and CSS classes.
- **React app:** React 19, react-router-dom (HashRouter), MUI (TextField, Select, Checkbox, RadioGroup, Table, Dialog, Snackbar), react-datepicker for date picker.
- **Vue app:** Vue 3.5 Composition API, vue-router 4 (hash history), Vuetify (v-text-field, v-select, v-checkbox, v-radio-group, v-data-table, v-dialog, v-snackbar), @vuepic/vue-datepicker.
- **Angular app:** Angular 19 standalone components, Angular Router (hash location), Angular Material (mat-form-field, mat-select, mat-checkbox, mat-radio-group, mat-table + matSort, MatDialog, MatSnackBar, mat-datepicker).
- **Svelte app:** Svelte 5+, hash-based routing, Bits UI (Select, Checkbox, RadioGroup, Dialog), flatpickr for date picker, custom `$state`-based toast.
- **Next.js app:** Next.js 16 (App Router, SSR dev mode), MUI (same component set as React app), react-datepicker, react-hot-toast, server/client component split.
- **Lit app:** Lit 3, Vite 7, TypeScript. Shoelace form controls (sl-input, sl-select, sl-checkbox, sl-radio-group) in shadow DOM, custom Lit web components for dialog and toast, native `<input type="date">`. Hash-based routing.

---

## Compatibility Matrix

| App | Port | Status | Notes |
|-----|------|--------|-------|
| vanilla-html | 3001 | ✅ | Reference implementation — all contract elements pass |
| react-app | 3002 | ✅ | MUI (TextField, Select, Checkbox, RadioGroup, Table, Dialog, Snackbar) + react-datepicker |
| vue-app | 3003 | ✅ | Vuetify (v-text-field, v-select, v-checkbox, v-radio-group, v-data-table, v-dialog, v-snackbar) + vue-datepicker |
| angular-app | 3004 | ✅ | Angular Material (mat-form-field, mat-select, mat-checkbox, mat-radio-group, mat-table, MatDialog, MatSnackBar, mat-datepicker) |
| svelte-app | 3005 | ✅ | Bits UI (Select, Checkbox, RadioGroup, Dialog) + flatpickr + custom `$state` toast |
| nextjs-app | 3006 | ✅ | MUI (same as react-app) + react-datepicker + react-hot-toast |
| lit-app | 3007 | ✅ | Shoelace (sl-input, sl-select, sl-checkbox, sl-radio-group) + custom Lit dialog/toast + native date input |

---

## What Is GeneralStore?

Every app implements the same fictional **GeneralStore** mini storefront:

- **Home page** — Product catalog with a data table, search/filter, category dropdown, quantity stepper, "Add to Cart" button, shipping options, and delivery date picker.
- **About page** — A short description of the store.

The apps are intentionally trivial. They exist to provide a consistent, testable surface across different rendering paradigms (virtual DOM, reactive, compiled, web components). Elements are identified by **semantic HTML, ARIA attributes, and CSS classes** (not `data-testid`) — see [REQUIREMENTS.md §6](docs/REQUIREMENTS.md) for the full element identification reference.

---

## Project Structure

```
test_app/
├── apps/
│   ├── vanilla-html/       ← plain HTML/CSS/JS, no build step
│   ├── react-app/           ← React (Vite)
│   ├── vue-app/             ← Vue 3 (Vite)
│   ├── angular-app/         ← Angular (Angular CLI)
│   ├── svelte-app/          ← Svelte (Vite)
│   ├── nextjs-app/          ← Next.js (SSR dev mode)
│   └── lit-app/             ← Lit web components
├── framework/               ← Playwright element interaction library
│   ├── src/                 ← By class, handler registry, group element, typed wrappers
│   ├── tests/               ← 1,064 integration + 312 unit tests
│   └── playwright.config.ts
├── tools/crawler/           ← Runtime page crawler + page object emitter
├── docs/
│   ├── CONTRIBUTING.md      ← start here — onboarding guide
│   ├── REQUIREMENTS.md      ← goals, UI contract, conventions
│   ├── ROADMAP.md           ← phase summary + open phases
│   └── archive/             ← historical docs (completed checklists, closed issues)
├── .nvmrc                   ← Node 20 LTS
├── .gitignore
├── package.json             ← root package with start:all script
└── README.md                ← this file
```

---

## Framework Library

The `framework/` directory contains a **Playwright-based element interaction library** built on top of the test apps. Key features:

- **Label-first identification** — `write("Category", "Electronics")` instead of raw locators
- **Auto-detection** — handler registry classifies elements (checkbox, select, radio group, etc.) automatically
- **Group element** — `write()`, `read()`, `writeAll()`, `readAll()`, `click()`, `find()` for any container
- **Typed wrappers** — `table.sort()`, `stepper.increment()`, `dialog.close()` for rich behaviour
- **1,819 tests passing** — framework: 1,064 integration (7 apps) + 312 unit; crawler: 329 integration (7 apps) + 114 unit

See [`framework/README.md`](framework/README.md) for full API documentation.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | **Start here** — onboarding, setup, how to run tests, how to add apps |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Goals, architecture, UI contract, conventions, resolved decisions |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase summary table (all phases complete) |
| [framework/README.md](framework/README.md) | Framework API documentation |
| [tools/crawler/README.md](tools/crawler/README.md) | Crawler & page object emitter documentation |
| [docs/archive/](docs/archive/) | Historical docs — completed checklists, closed issues, superseded reviews |

---

## Key Conventions

- **Semantic identification is the contract.** Every testable element is identified by semantic HTML, ARIA attributes, CSS classes, and labels — no `data-testid`. See [REQUIREMENTS.md §6](docs/REQUIREMENTS.md).
- **No runtime network requests.** All libraries are bundled locally. Async behavior uses `setTimeout` / `Promise`.
- **One command to start:** `cd apps/<app-name> && npm install && npm start`.
- **Lockfiles committed.** Every app's `package-lock.json` is checked in for reproducible installs.
