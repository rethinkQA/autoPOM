# Test Target Application Library

> **GeneralStore** — A collection of minimal web apps implementing a fictional storefront, built with different frontend technologies. These apps serve as stable, predictable test targets for a standardized Playwright-based testing framework.

---

## Quick Start

```bash
# Prerequisites
node -v   # Must be Node 20 LTS (see .nvmrc)
nvm use   # If using nvm

# Start a single app
cd apps/vanilla-html
npm install
npm start

# Start all apps simultaneously
npm run start:all
```

---

## App Catalog

| App | Technology | Port | Start Command | Status |
|-----|-----------|------|---------------|--------|
| `vanilla-html` | HTML / CSS / JS (no framework) | 3001 | `npx serve -l 3001` | ✅ Done |
| `react-app` | React 19 + TypeScript (Vite 7) | 3002 | `vite --port 3002` | ✅ Done |
| `vue-app` | Vue 3.5 + TypeScript (Vite 7) | 3003 | `vite --port 3003` | ✅ Done |
| `angular-app` | Angular 17+ (Angular CLI) | 3004 | `ng serve --port 3004` | ✅ Done |
| `svelte-app` | Svelte 5+ (Vite 7) | 3005 | `vite --port 3005` | ✅ Done |
| `nextjs-app` | Next.js 16 (SSR, App Router) | 3006 | `next dev -p 3006` | ✅ Done |
| `lit-app` | Lit 3 (Web Components, Vite 6) | 3007 | `vite --port 3007` | ✅ Done |

> **HTMX deferred:** An `htmx-app` was originally planned but deferred from v0.1. The 7 apps above provide sufficient technology diversity.

### Implementation Notes

- **Vanilla HTML:** Reference implementation — plain HTML/CSS/JS, native `<dialog>`, native `<input type="date">`, hash-based routing. All elements identified by semantic HTML, ARIA attributes, and CSS classes.
- **React app:** React 19, react-router-dom (HashRouter), react-datepicker for date picker, custom toast and native `<dialog>`.
- **Vue app:** Vue 3.5 Composition API, vue-router 4 (hash history), @vuepic/vue-datepicker, custom toast composable, native `<dialog>`.
- **Angular app:** Angular 17+ standalone components, Angular Router (hash location), Angular Material mat-datepicker + MatSnackBar + MatDialog.
- **Svelte app:** Svelte 5+, hash-based routing, flatpickr for date picker, custom toast, native `<dialog>`.
- **Next.js app:** Next.js 16 (App Router, SSR dev mode), react-datepicker, react-hot-toast, server/client component split. Layout + About are server components; Nav + Home are client components (`'use client'`).
- **Lit app:** Lit 3, Vite 6, TypeScript. Shadow DOM stress test per §6.5 — structural elements (header, nav, footer) in light DOM, interactive elements (inputs, buttons, table, dialog, toast) inside shadow roots (requires Playwright `>>` piercing). Native `<dialog>`, native `<input type="date">`, custom toast. Hash-based routing.

---

## Compatibility Matrix

| App | Port | Status | Notes |
|-----|------|--------|-------|
| vanilla-html | 3001 | ✅ | Reference implementation — all contract elements pass |
| react-app | 3002 | ✅ | react-datepicker; modal/toast use native/custom (library suggestions deferred) |
| vue-app | 3003 | ✅ | vue-datepicker; modal/toast use native/custom (library suggestions deferred) |
| angular-app | 3004 | ✅ | Angular Material mat-datepicker, MatSnackBar, MatDialog |
| svelte-app | 3005 | ✅ | flatpickr; custom toast (library suggestions deferred) |
| nextjs-app | 3006 | ✅ | react-datepicker, react-hot-toast; modal uses native `<dialog>` |
| lit-app | 3007 | ✅ | All native — Shadow DOM stress test |

---

## What Is GeneralStore?

Every app implements the same fictional **GeneralStore** mini storefront:

- **Home page** — Product catalog with a data table, search/filter, category dropdown, quantity stepper, "Add to Cart" button, shipping options, and delivery date picker.
- **About page** — A short description of the store.

The apps are intentionally trivial. They exist to provide a consistent, testable surface across different rendering paradigms (virtual DOM, reactive, compiled, web components). Elements are identified by **semantic HTML, ARIA attributes, and CSS classes** (not `data-testid`) — see [`shared/ui-contract.md`](shared/ui-contract.md) for the full element identification reference.

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
├── shared/
│   └── ui-contract.md       ← the common testable surface
├── docs/
│   ├── REQUIREMENTS.md      ← full project requirements + framework design (§11)
│   └── ROADMAP.md           ← implementation roadmap
├── .nvmrc                   ← Node 20 LTS
├── .gitignore
├── package.json             ← root package with start:all script
└── README.md                ← this file
```

---

## Documentation

- [Requirements & Plan](docs/REQUIREMENTS.md) — Goals, architecture, UI contract, conventions, resolved decisions, and **framework library design (§11)**.
- [Implementation Roadmap](docs/ROADMAP.md) — Phase-by-phase build plan with checklists (includes Phase 8: Framework Library).
- [UI Contract](shared/ui-contract.md) — Standalone reference for the common testable surface all apps must implement.

---

## Key Conventions

- **Semantic identification is the contract.** Every testable element is identified by semantic HTML, ARIA attributes, CSS classes, and labels — no `data-testid`. See [`shared/ui-contract.md`](shared/ui-contract.md).
- **No runtime network requests.** All libraries are bundled locally. Async behavior uses `setTimeout` / `Promise`.
- **One command to start:** `cd apps/<app-name> && npm install && npm start`.
- **Lockfiles committed.** Every app's `package-lock.json` is checked in for reproducible installs.
