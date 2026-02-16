# Implementation Roadmap

> **Ref:** [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)
> **Created:** 2026-02-16
> **Estimated effort:** ~4–6 focused days (solo)

---

## How to Use This Roadmap

Each phase builds on the previous one. **Don't skip ahead** — the early phases establish the contract and baseline that everything else depends on. Check off tasks as you go.

---

## Phase 0: Project Scaffolding _(~30 min)_

> Set up the repo structure and shared artifacts before writing any app code.

- [ ] Initialize git repo at `test_app/` root (if not already done)
- [ ] Create the directory structure:
  ```
  apps/
  shared/
  docs/
  ```
- [ ] Create `.nvmrc` at repo root pinned to Node 20 LTS
- [ ] Create root `package.json` with:
  - `concurrently` as a dev dependency (`npm install -D concurrently`)
  - A `start:all` script that launches all 8 apps simultaneously:
    ```json
    "start:all": "concurrently \"npm start --prefix apps/vanilla-html\" \"npm start --prefix apps/react-app\" \"npm start --prefix apps/vue-app\" \"npm start --prefix apps/angular-app\" \"npm start --prefix apps/svelte-app\" \"npm start --prefix apps/nextjs-app\" \"npm start --prefix apps/lit-app\" \"npm start --prefix apps/htmx-app\""
    ```
- [ ] Create `shared/ui-contract.md` — copy §6 from REQUIREMENTS.md into a standalone reference doc that you'll use as a checklist for every app (include §6.0 store theme, §6.5 Shadow DOM handling)
- [ ] Create root `README.md` with project overview, GeneralStore theme description, table of apps/ports, and quick-start instructions
- [ ] Create a `.gitignore` covering `node_modules/`, `dist/`, `.next/`, `.angular/`, etc.
- [ ] All Open Questions from §10 have been resolved — see Resolved Decisions in REQUIREMENTS.md. No blocking decisions remain.
- [ ] **Version pinning note:** Record the scaffolding tool versions you use (Vite, Next.js CLI, Angular CLI) in each app's README for reproducibility.

---

## Phase 1: Vanilla HTML Baseline _(~3–4 hours)_

> Build the simplest possible app first. This becomes the **reference implementation** that all other apps are measured against. Uses plain JavaScript (no TypeScript) — this app is intentionally zero-tooling.

- [ ] Create `apps/vanilla-html/`
- [ ] Build a single `index.html` + `style.css` + `app.js` (no build tools, no npm dependencies beyond a static server)
- [ ] Implement the **GeneralStore** theme (§6.0): Home page with product catalog, About page with store description
- [ ] Implement every element from the UI contract (§6.1–6.4):
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
- [ ] Add all `data-testid` attributes exactly as specified in §6
- [ ] Add semantic HTML + labels + ARIA (§6.4)
- [ ] Add a `package.json` with a `start` script using a simple static server: `npx serve -l 3001`
- [ ] Verify: `npm start` → opens on `http://localhost:3001`
- [ ] Create `apps/vanilla-html/README.md`
- [ ] **Snapshot this as the golden reference** — screenshot or manual walkthrough of every testable element

---

## Phase 2: Vite-Based Apps — React, Vue, Svelte _(~3–4 hours)_

> These three share the same build tool (Vite), so they'll follow a similar pattern. Build them in parallel or sequentially.

### React App
- [ ] Scaffold: `npm create vite@latest react-app -- --template react-ts` inside `apps/`
- [ ] Strip out boilerplate, implement GeneralStore UI contract (§6)
- [ ] Use `react-router-dom` for routing (Home / About views)
- [ ] Configure Vite dev server to port `3002`
- [ ] Set `start` script in `package.json` → `vite --port 3002`
- [ ] Verify: `npm start` → opens on `http://localhost:3002`, all contract elements present
- [ ] Create `apps/react-app/README.md`

### Vue App
- [ ] Scaffold: `npm create vite@latest vue-app -- --template vue-ts` inside `apps/`
- [ ] Strip boilerplate, implement GeneralStore UI contract (§6)
- [ ] Use `vue-router` for routing
- [ ] Configure port `3003`
- [ ] Set `start` script → `vite --port 3003`
- [ ] Verify: `npm start` → opens on `http://localhost:3003`, all contract elements present
- [ ] Create `apps/vue-app/README.md`

### Svelte App
- [ ] Scaffold: `npm create vite@latest svelte-app -- --template svelte-ts` inside `apps/`
- [ ] Strip boilerplate, implement GeneralStore UI contract (§6)
- [ ] Use hash-based or simple conditional routing (or `svelte-routing`)
- [ ] Configure port `3005`
- [ ] Set `start` script → `vite --port 3005`
- [ ] Verify: `npm start` → opens on `http://localhost:3005`, all contract elements present
- [ ] Create `apps/svelte-app/README.md`

---

## Phase 3: Angular App _(~2–3 hours)_

> Angular has its own CLI and build system — treat it separately.

- [ ] Scaffold: `npx @angular/cli new angular-app --minimal --standalone --skip-git` inside `apps/`
- [ ] Strip boilerplate, implement GeneralStore UI contract (§6) using standalone components
- [ ] Use Angular Router for navigation (Home / About)
- [ ] Set port to `3004` in `angular.json` (`serve.options.port`)
- [ ] Set `start` script → `ng serve --port 3004`
- [ ] Verify: `npm start` → opens on `http://localhost:3004`, all contract elements present
- [ ] Create `apps/angular-app/README.md`

---

## Phase 4: Next.js SSR App _(~2–3 hours)_

> Next.js in SSR dev mode — exercises real server-side rendering and hydration. `next dev` is a dev server (same category as Vite), not a production backend. No API routes, no database — satisfies G4.

- [ ] Scaffold: `npx create-next-app@latest nextjs-app --typescript` inside `apps/`
- [ ] **Do not** set `output: 'export'` — run in SSR dev mode to get real hydration behavior
- [ ] Implement GeneralStore UI contract (§6) using App Router (`app/` directory)
- [ ] Use Next.js `<Link>` for routing between Home / About pages
- [ ] Set dev server to port `3006` in `package.json` start script: `next dev -p 3006`
- [ ] Verify: `npm start` → opens on `http://localhost:3006`, all contract elements present
- [ ] Note any hydration-specific caveats in the app's README
- [ ] Create `apps/nextjs-app/README.md`

---

## Phase 5: Web Components — Lit App _(~2–3 hours)_

> This is the **Shadow DOM stress test** — critical for framework selector strategy validation.

- [ ] Scaffold a Lit project in `apps/lit-app/` (Vite + Lit starter or manual setup, TypeScript)
- [ ] Implement GeneralStore UI contract (§6) as Lit custom elements
- [ ] **Shadow DOM `data-testid` placement — follow §6.5 of REQUIREMENTS.md (resolved):**
  - Place `data-testid` on the **custom element host** (light DOM) for page-level structural elements: `app-header`, `nav-home`, `nav-about`, `about-text`, `main-content`, `app-footer`
  - Place `data-testid` **inside the shadow root** for interactive elements: `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `data-table`, `table-sort`, `table-filter`, `date-picker`, `quantity-input`, `modal-dialog`, `toast-notification`, `item-list`, `delayed-content`, `validation-message`
  - This dual placement tests both standard and shadow DOM piercing selectors
- [ ] Use hash-based routing or simple conditional rendering for navigation
- [ ] Configure port `3007`
- [ ] Verify: `npm start` → opens on `http://localhost:3007`, all contract elements present
- [ ] Create `apps/lit-app/README.md` with shadow DOM notes

---

## Phase 6: HTMX App _(~2–3 hours)_

> No SPA, no JavaScript framework. Uses plain JavaScript (no TypeScript). This validates that the test framework doesn't assume JS-driven DOM updates.

- [ ] Create `apps/htmx-app/` with static HTML files
- [ ] Include HTMX library locally (downloaded, not CDN)
- [ ] **Server approach (resolved — see REQUIREMENTS.md §10, Q6):** Use a minimal Express static file server (~30 lines in `server.js`) that serves HTML fragment files from a `/partials` directory. No logic, no state — just `GET /partials/about.html` → returns raw HTML. This is functionally identical to `npx serve` and satisfies G4.
- [ ] Implement GeneralStore UI contract (§6):
  - HTMX swaps for navigation (`hx-get` loading HTML partials from the local server)
  - Interactive elements can use inline `<script>` for non-HTMX behaviors (table sorting, filtering, validation)
  - Delayed content via `hx-trigger="load delay:1s"` or `setTimeout`
- [ ] Configure port `3008`
- [ ] Verify: `npm start` → opens on `http://localhost:3008`, all contract elements present
- [ ] Create `apps/htmx-app/README.md`

---

## Phase 7: Final Validation & Documentation _(~1–2 hours)_

> Run everything together and lock it down.

- [ ] Run `npm run start:all` from root — verify all 8 apps start on their assigned ports
- [ ] Manually verify each app in the browser: all GeneralStore UI contract elements present and functional
- [ ] Capture results in a compatibility matrix:
  ```
  | App            | Port | Status | Notes          |
  |----------------|------|--------|----------------|
  | vanilla-html   | 3001 | ✅     |                |
  | react-app      | 3002 | ✅     |                |
  | ...            | ...  | ...    |                |
  ```
- [ ] Update root `README.md` with final status and instructions
- [ ] Update `shared/ui-contract.md` with any amendments discovered during implementation
- [ ] Tag the repo as `v0.1.0`

---

## Suggested Build Order (Summary)

| Order | Phase | App(s) | Why This Order |
|-------|-------|--------|---------------|
| 1 | Phase 0 | — | Scaffolding first, always |
| 2 | Phase 1 | `vanilla-html` | Reference implementation — no framework noise |
| 3 | Phase 2 | `react-app` | Most common target, validates contract against a real SPA |
| 4 | Phase 2 | `vue-app`, `svelte-app` | Similar Vite pattern, fast to build after React |
| 5 | Phase 3 | `angular-app` | Different build system, good mid-point milestone |
| 6 | Phase 4 | `nextjs-app` | SSR + hydration edge cases — good to catch issues before the hard ones |
| 7 | Phase 5 | `lit-app` | Shadow DOM — hardest selector challenges, do it late when contract is stable |
| 8 | Phase 6 | `htmx-app` | Non-SPA paradigm — most likely to surface contract edge cases |
| 9 | Phase 7 | — | Final validation pass |

---

## Tips

- **Don't over-build the apps.** If you're spending more than 3 hours on a single app, you're adding too much. These are test fixtures with a store theme, not real e-commerce apps.
- **Use the vanilla-html app as your reference.** When in doubt about how a contract element should look or behave, check the vanilla baseline.
- **Lit and HTMX will be the most interesting.** They'll likely force you to think about selector and interaction strategies. That's the point.
- **Commit after each phase.** Each phase is a stable checkpoint.

---

*This roadmap is a companion to [REQUIREMENTS.md](../docs/REQUIREMENTS.md). Update both as decisions are made.*
