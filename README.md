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

| App | Technology | Port | Start Command |
|-----|-----------|------|---------------|
| `vanilla-html` | HTML / CSS / JS (no framework) | 3001 | `npx serve -l 3001` |
| `react-app` | React 18+ (Vite) | 3002 | `vite --port 3002` |
| `vue-app` | Vue 3 (Vite) | 3003 | `vite --port 3003` |
| `angular-app` | Angular 17+ (Angular CLI) | 3004 | `ng serve --port 3004` |
| `svelte-app` | Svelte 5+ (Vite) | 3005 | `vite --port 3005` |
| `nextjs-app` | Next.js 14+ (SSR) | 3006 | `next dev -p 3006` |
| `lit-app` | Lit 3+ (Web Components) | 3007 | `vite --port 3007` |
| `htmx-app` | HTMX 2+ | 3008 | `node server.js` |

---

## What Is GeneralStore?

Every app implements the same fictional **GeneralStore** mini storefront:

- **Home page** — Product catalog with a data table, search/filter, category dropdown, quantity stepper, "Add to Cart" button, shipping options, and delivery date picker.
- **About page** — A short description of the store.

The apps are intentionally trivial. They exist to provide a consistent, testable surface across different rendering paradigms (virtual DOM, reactive, compiled, web components, hypermedia). The `data-testid` contract defined in [`shared/ui-contract.md`](shared/ui-contract.md) is what makes cross-app testing possible.

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
│   ├── lit-app/             ← Lit web components
│   └── htmx-app/            ← HTMX (hypermedia-driven)
├── shared/
│   └── ui-contract.md       ← the common testable surface
├── docs/
│   ├── REQUIREMENTS.md      ← full project requirements
│   └── ROADMAP.md           ← implementation roadmap
├── .nvmrc                   ← Node 20 LTS
├── .gitignore
├── package.json             ← root package with start:all script
└── README.md                ← this file
```

---

## Documentation

- [Requirements & Plan](docs/REQUIREMENTS.md) — Goals, architecture, UI contract, conventions, and resolved decisions.
- [Implementation Roadmap](docs/ROADMAP.md) — Phase-by-phase build plan with checklists.
- [UI Contract](shared/ui-contract.md) — Standalone reference for the common testable surface all apps must implement.

---

## Key Conventions

- **`data-testid` is the contract.** Every testable element has a stable `data-testid` attribute. See [`shared/ui-contract.md`](shared/ui-contract.md).
- **No runtime network requests.** All libraries are bundled locally. Async behavior uses `setTimeout` / `Promise`.
- **One command to start:** `cd apps/<app-name> && npm install && npm start`.
- **Lockfiles committed.** Every app's `package-lock.json` is checked in for reproducible installs.
