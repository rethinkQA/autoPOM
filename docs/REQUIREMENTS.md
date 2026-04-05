# Test Target Application Library — Requirements & Plan

> **Author:** Staff SDET
> **Created:** 2026-02-16
> **Status:** Draft
> **Version:** 0.1.0

---

## 1. Purpose

This project is a curated library of minimal ("hello world") web applications, each built with a different frontend technology. These applications exist for **one reason**: to serve as stable, predictable test targets for a standardized Playwright-based testing framework.

They are not products. They are not demos. They are **test fixtures at the application level.**

---

## 2. Goals

| # | Goal | Rationale |
|---|------|-----------|
| G1 | Provide diverse frontend technology coverage | The testing framework must prove it can handle different DOM rendering strategies, routing models, and component lifecycles. |
| G2 | Keep each app trivially simple | Complexity in the app under test creates noise when debugging the *framework*. Hello-world scope keeps signal high. |
| G3 | Implement a consistent UI contract across all apps | Every app should expose the same set of testable surfaces so framework tests can be written once and pointed at any target. |
| G4 | No application backend | Reduces infrastructure, startup time, and flakiness. All apps are static or use dev servers only. Dev servers that serve static files or HTML fragments are permitted — the constraint is no application logic on the server (no databases, no auth, no business logic). |
| G5 | Be individually launchable with a single command | Each app must start in isolation — no monorepo dev server dependency. |
| G6 | Serve as a living compatibility matrix | As the framework evolves, this library validates that new abstractions don't silently break against specific technologies. |

---

## 3. Scope

### 3.1 In Scope

- Static / client-side-only web applications
- Frontend framework diversity (see §5)
- Common UI patterns required for framework validation (see §6)
- Local dev-server execution
- Documentation per app (how to install, start, and what it exposes)

### 3.2 Out of Scope

- Backend / API services
- Database or persistence layers
- Authentication flows (may be revisited later)
- Mobile or native applications
- Production deployment or hosting
- Performance / load testing targets

---

## 4. Architecture Overview

```
test_app/
├── docs/
│   ├── REQUIREMENTS.md          ← this document
│   └── ROADMAP.md               ← implementation roadmap
├── apps/
│   ├── vanilla-html/            ← plain HTML/CSS/JS, no build step
│   ├── react-app/               ← React (Vite)
│   ├── vue-app/                 ← Vue 3 (Vite)
│   ├── angular-app/             ← Angular (Angular CLI)
│   ├── svelte-app/              ← Svelte (Vite)
│   ├── nextjs-app/              ← Next.js (production build, no API routes)
│   └── lit-app/                 ← Lit web components
├── framework/                   ← Playwright element interaction library
├── tools/crawler/               ← Runtime page crawler + page object emitter
├── shared/                      ← Shared data & logic (TypeScript)
└── README.md
```

Each app is **self-contained** with its own `package.json` (or equivalent) and can be started independently.

---

## 5. Technology Matrix

These technologies were selected to stress-test different rendering and DOM interaction models that the Playwright framework must handle.

| App | Technology | Why It Matters to a Test Framework |
|-----|-----------|-----------------------------------|
| `vanilla-html` | HTML / CSS / JS (no framework) | Baseline — raw DOM, no virtual DOM, no lifecycle. Proves the framework doesn't accidentally depend on framework-specific behavior. |
| `react-app` | React 19 (Vite) | Virtual DOM, synthetic events, async state updates, component re-renders. The most common SPA target. |
| `vue-app` | Vue 3 (Composition API, Vite) | Reactive proxy system, template-based rendering, transition system. |
| `angular-app` | Angular 19 (standalone components) | Zone.js change detection, RxJS async patterns, strict typing, shadow DOM option. |
| `svelte-app` | Svelte 5+ (Vite) | Compile-time framework — no runtime library in the DOM. Tests that the framework doesn't rely on runtime framework globals. |
| `nextjs-app` | Next.js 16 (production build) | File-based routing, server-side rendering, hydration edge cases. Runs via `next build && next start` to exercise production SSR + hydration — validates that the test framework correctly waits for hydration before interacting with elements. |
| `lit-app` | Lit 3+ | Native Web Components, Shadow DOM by default. Critical for testing shadow DOM piercing/interaction strategies. |

> **Note:** This list is intentionally opinionated. It covers the major rendering paradigms (virtual DOM, reactive, compiled, web components). Additional apps (e.g., HTMX) can be added later without disrupting existing ones.
>
> **HTMX deferred:** The `htmx-app` was originally planned but deferred from v0.1. The existing 7 apps provide sufficient technology diversity to validate the framework.

---

## 6. UI Contract (Common Testable Surface)

Every application **must** implement the following UI elements and behaviors. This is the shared contract that allows framework tests to be written generically.

### 6.0 Application Theme — "GeneralStore"

All apps implement a fictional **"GeneralStore"** mini storefront. This thin theme gives every UI element a natural reason to exist without adding complexity. The theme is cosmetic — elements are identified by their semantic HTML, ARIA attributes, CSS classes, and native DOM structure.

| Page | Content | Notes |
|------|---------|-------|
| **Home** | Product catalog — a data table of products, search/filter input, category dropdown, quantity stepper, "Add to Cart" action button, shipping options, delivery date picker | All interactive elements from §6.2 live here |
| **About** | Store description — a short paragraph about GeneralStore | Must include `class="about-text"` |

> The store theme should feel like a static prototype, not a working e-commerce app. No cart state persistence, no checkout flow, no real pricing logic. If an element needs to "do something" (e.g., Add to Cart), it displays a toast notification or updates an output display — nothing more.

#### Canonical Product Data

All apps **must** use this exact dataset to ensure cross-app test assertions are consistent:

| Name | Price | Category | In Stock |
|------|-------|----------|----------|
| Wireless Mouse | 29.99 | Electronics | Yes |
| Bluetooth Keyboard | 49.99 | Electronics | Yes |
| USB-C Hub | 39.99 | Electronics | No |
| Running Shoes | 89.99 | Clothing | Yes |
| Winter Jacket | 129.99 | Clothing | No |
| Cooking Basics | 24.99 | Books | Yes |
| Science Fiction Novel | 14.99 | Books | Yes |

> **Category dropdown values** (§6.2): "All" (default — shows everything), "Electronics", "Books", "Clothing" — in this order.
>
> **In Stock mapping:** "Yes" = boolean `true`, "No" = boolean `false`. Used by the checkbox filter.
>
> **Price display:** Always formatted as `$XX.XX` (US dollar sign, two decimal places).

### 6.1 Page Structure

| Element | Requirement |
|---------|-------------|
| Header | Visible heading with store name and technology identifier |
| Navigation | At least 2 links/buttons that switch views/pages (Home, About) |
| Main content area | Container that changes based on current view |
| About content | Store description paragraph, visible on the About page |
| Footer | Static footer with text |

### 6.2 Interactive Elements

| Element | Requirement | Store Context |
|---------|-------------|---------------|
| Text input | Single text field | Product search / filter input |
| Button (action) | Triggers a visible state change on click | "Add to Cart" button |
| Output display | Shows result of button click | Confirmation message (e.g., "Added Wireless Mouse") |
| Checkbox | Toggleable, affects visible state | "Show only in-stock items" filter |
| Dropdown / Select | At least 3 options, selection reflected in UI | Product category filter (All, Electronics, Books, Clothing) |
| Radio button group | Mutually exclusive options, selection affects visible state | Shipping method (Standard / Express / Overnight) with displayed cost |
| Radio output | Displays the cost/label for the selected radio option | Shipping cost (e.g., "$4.99", "$9.99", "$19.99") |
| Data table | Tabular data with at least 4 columns and 3+ rows | Product catalog (Name, Price, Category, Stock) |
| Date picker | Technology-appropriate date picker widget; native `<input type="date">` in vanilla baseline, component-library date pickers in framework apps (see §6.7) | Delivery date selection |
| Date output | Displays the formatted selected date | Chosen delivery date (e.g., "February 20, 2026") |
| Quantity stepper | Numeric input with increment/decrement controls (+/−) | Product quantity selector |
| Quantity increment | The "+" button of the quantity stepper | Increases quantity by 1 (disabled at 99) |
| Quantity decrement | The "−" button of the quantity stepper | Decreases quantity by 1 (disabled at 1) |
| Modal trigger | Button or link that opens the modal dialog | "View Details" link/button on a product row |
| Modal / Dialog | Overlay that opens and closes, contains content; native `<dialog>` in vanilla baseline, component-library dialogs in framework apps (see §6.7) | Product detail or order confirmation dialog |
| Modal close | Button that closes the modal dialog | Close button inside the modal |
| Toast / Notification | Temporary message that auto-dismisses after a timeout; custom in baseline, technology-native toast library in framework apps (see §6.7) | "Added to cart" feedback — **must** be triggered by `action-button` click (auto-dismiss after 3s) |

### 6.3 Dynamic Behaviors

| Behavior | Requirement | Details |
|----------|-------------|---------|
| Conditional rendering | An element that appears/disappears based on interaction | Toggled by checkbox (e.g., filtering in-stock products) |
| List rendering | A static or dynamically generated list of 3+ items | Identified by list semantic elements (`<ul>`/`<ol>`) or `class="item-list"` |
| Delayed content | Content that appears after a simulated delay (setTimeout, not a real API) | 1–2 second delay, identified by `aria-live` attribute (e.g., "Loading recommendations…") |
| Form validation | Inline validation message on empty submit | Identified by `class="validation-message"` with `aria-live` (e.g., "Please enter a search term") |
| Routing / View switching | Navigation changes visible content without full page reload (where applicable) | URL or hash changes for SPA apps |
| Table sorting | Clicking a column header sorts the data table by that column | Sortable column headers use `th[data-sort-key]` with `role="button"`; toggles ascending/descending |
| Table filtering | Typing in the text input filters table rows in real time | `class="filter-bar"` is the container element (e.g., `<div>`) wrapping the filter controls. The text `<input>` inside the filter bar is the search field. |
| Empty results | When all filters combined produce zero matching rows, the table body shows a single row spanning all columns with text "No products found." | Identified by text content "No products found." or `class="empty-state"` |
| Date selection | Selecting a date in the date picker displays the chosen date in a visible output | Formatted date (e.g., "February 20, 2026") shown in the date output element (identifiable by `class="date-output"` or associated label) |
| Radio selection | Choosing a radio option updates a visible cost/label | e.g., selecting "Express" shows "$9.99" in the radio output element (identifiable by `class="radio-output"` or associated label) |
| Modal lifecycle | The modal trigger button opens the modal; the close button or overlay click dismisses it | Modal must trap focus while open; uses `<dialog>` element where possible |
| Toast auto-dismiss | Toast appears on action button click, then auto-dismisses after ~3 seconds | Must be visible long enough for assertion; uses `aria-live="polite"` |

### 6.4 Accessibility Baseline

| Requirement | Details |
|-------------|---------|
| Semantic HTML | Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<button>`, `<label>` |
| Labels | All inputs must have associated `<label>` elements |
| ARIA attributes | Conditional/dynamic content should use `aria-live` or `aria-hidden` as appropriate |
| Focus management | Keyboard-navigable interactive elements |

> This accessibility baseline is not exhaustive — it exists so the framework can validate accessibility-aware selector strategies (role-based locators, label-based locators, etc.).

### 6.5 Shadow DOM Handling (Lit and Web Component Apps)

Lit-based apps use native Web Components with Shadow DOM. The general structure is:

- **Light DOM (host element):** Page-level structural elements — header, navigation, footer, and main content containers. These are identifiable by semantic HTML tags (`<header>`, `<nav>`, `<main>`, `<footer>`) and CSS classes, and work the same as in non-Shadow DOM apps.
- **Shadow root (inside components):** Interactive elements — form inputs, buttons, tables, dialogs, toasts, etc. These are identifiable by semantic HTML elements (`<input>`, `<button>`, `<table>`, `<dialog>`), ARIA attributes, roles, and CSS classes within the shadow root.

The external test framework should use Playwright's built-in `>>` shadow DOM piercing (e.g., `locator('my-element >> button.action-button')`) to reach elements inside shadow roots.

> This dual-placement strategy ensures the test framework is validated against both light DOM and shadow DOM scenarios. Structural elements in light DOM match the same semantic selectors used in non-Shadow DOM apps. Interactive elements inside shadow roots force the framework to demonstrate shadow DOM piercing using semantic selectors.

### 6.6 Interaction Specifications

To ensure all 8 apps behave identically (enabling "one test suite, any app"), the following interaction rules apply:

| Interaction | Specification |
|-------------|---------------|
| **Filter composition** | Text input, category dropdown, and in-stock checkbox filters are AND-ed. A product must match all active filters to appear. |
| **Text input filter scope** | Filters against the product **Name** column only (case-insensitive, substring match). |
| **Default sort order** | Table rows are unsorted (insertion order) on initial load. |
| **Sort toggle behavior** | First click on a column header → ascending. Second click → descending. Third click → back to ascending. No neutral/unsorted toggle. |
| **Empty results** | When filters produce zero matching rows, the table body shows a single row spanning all columns with the text "No products found." |
| **Quantity stepper bounds** | Minimum value: `1`. Maximum value: `99`. The `−` button is disabled at 1; the `+` button is disabled at 99. Default value on load: `1`. |

> These rules are intentionally minimal. The goal is behavioral consistency across apps, not feature richness.

### 6.7 Technology-Native Components

The `vanilla-html` app uses only native HTML elements (`<input type="date">`, `<dialog>`, `<select>`, etc.) and serves as the **pure baseline**. Framework apps **must** use **idiomatic, technology-native component libraries** for all UI elements where such libraries exist. This is the primary mechanism that generates real DOM diversity across the 7 apps. Without it, the project is validating the framework against the same native HTML repeated 7 times — which Playwright already handles natively.

#### Principles

1. **The behavioral contract is the only shared contract.** Same inputs produce same outputs — filter logic, sort order, stepper bounds, toast timing, etc. The *what* doesn't change; the *how* is deliberately different per app.
2. **DOM structure is unconstrained.** Each app produces the DOM its component library produces. There is no requirement for apps to use the same tags, attributes, or DOM nesting. The framework must handle the DOM as-is.
3. **Element identification is outcome-based.** The framework identifies elements by accessible name, role, label association, visible text, or other semantic anchors that survive component library changes — not by tag name or CSS class.
4. **Interaction model is technology-aware.** The test framework abstracts over different DOM structures to verify identical outcomes. For example, selecting a date in a native `<input type="date">` uses `page.fill()`, while a React datepicker requires clicking to open, navigating months, and clicking a day cell. A native `<select>` uses `selectOption()`, while MUI Select requires clicking to open a listbox popup and clicking an option.

> **Why this matters:** The v0.1 apps used native `<select>`, native `<table>`, and native `<input>` everywhere. Phase 10 replaced native elements with component libraries, breaking that false confidence and forcing the framework to prove its cross-technology thesis. **Result: 1,043/1,043 integration tests pass across all 7 apps with genuinely different DOM structures.**

#### Component Matrix _(verified — Phase 10 complete)_

| Element | `vanilla-html` | `react-app` | `vue-app` | `angular-app` | `svelte-app` | `nextjs-app` | `lit-app` |
|---------|---------------|-------------|-----------|---------------|-------------|-------------|----------|
| Text input | Native `<input>` | MUI `<TextField>` | Vuetify `<v-text-field>` | `<mat-form-field>` + `<input matInput>` | Native `<input>` + `<label>` | MUI `<TextField>` | `<sl-input>` |
| Checkbox | Native `<input type="checkbox">` | MUI `<Checkbox>` | Vuetify `<v-checkbox>` | `<mat-checkbox>` | Bits UI `<Checkbox.Root>` | MUI `<Checkbox>` | `<sl-checkbox>` |
| Select / Dropdown | Native `<select>` | MUI `<Select>` | Vuetify `<v-select>` | `<mat-select>` | Bits UI `<Select.Root>` | MUI `<Select>` | `<sl-select>` |
| Radio group | Native `<fieldset>` + `<input type="radio">` | MUI `<RadioGroup>` | Vuetify `<v-radio-group>` | `<mat-radio-group>` | Bits UI `<RadioGroup.Root>` | MUI `<RadioGroup>` | `<sl-radio-group>` |
| Data table | Native `<table>` | MUI `<Table>` + `<TableSortLabel>` | Vuetify `<v-data-table>` | `<mat-table>` + `matSort` | Raw `<table>` (Bits UI has no table) | MUI `<Table>` + `<TableSortLabel>` | Raw `<table>` (Shoelace has no table) |
| Date picker | Native `<input type="date">` | `react-datepicker` | `@vuepic/vue-datepicker` | Angular Material `mat-datepicker` | `flatpickr` | `react-datepicker` | Native `<input type="date">` |
| Modal / Dialog | Native `<dialog>` | MUI `<Dialog>` | Vuetify `<v-dialog>` | Angular CDK `Dialog` | Bits UI `<Dialog.Root>` | MUI `<Dialog>` | Custom `<general-store-dialog>` (Lit web component) |
| Toast | Custom `<div>` | MUI `<Snackbar>` + `<Alert>` | Vuetify `<v-snackbar>` | Custom `<div>` toast | Custom `$state`-based toast | Custom `<div>` toast | Custom `<general-store-toast>` (Lit web component) |

> **Vanilla stays fully native.** It is the baseline — raw HTML with zero libraries.
>
> **Lit uses Shoelace for form controls, custom web components for dialog/toast.** Shoelace is built on Lit/Web Components, making it the natural component library for the Lit app. Where Shoelace has no equivalent (e.g., data table) or where the existing custom Lit web component is already idiomatic (dialog, toast), the native implementation is kept.
>
> **Svelte uses Bits UI (headless primitives).** Bits UI provides Radix-style headless primitives (`<Select.Root>`, `<Checkbox.Root>`, `<RadioGroup.Root>`, `<Dialog.Root>`) that render ARIA-compliant `role` attributes. This stresses the framework differently than styled libraries — portaled dropdowns, pure ARIA roles without native form tags.
>
> **Library choices reflect ecosystem norms.** The requirement is that the app uses **whatever a senior developer in that ecosystem would reach for** — not a specific package.

#### Impact on Testing Strategy

The framework's testing strategy is:

- ✅ "One **assertion set** (verify same behavioral outcomes) with **technology-aware interactions** (different DOM operations per component type)"

This is how production test frameworks operate. The framework exposes a component-aware abstraction layer (e.g., `datePicker.select(date)` that dispatches to the right interaction strategy, `group.write("Category", "Electronics")` that handles both native `<select>` and MUI Select via the handler registry).

> **The 1,043 integration tests (149 tests × 7 apps) served as the regression safety net.** As each app migrated to its component library, tests that broke revealed real gaps in the framework's handler registry and adapter layer. This breakage was the point — it was the signal that the framework was being tested against genuinely different DOM. All 924 tests now pass across all 7 apps.

---

## 7. Conventions

### 7.1 Element Identification Strategy

Apps do **not** use `data-testid` attributes. Elements are identified using **semantic anchors** that survive component library changes: accessible names (labels, `aria-label`), ARIA roles, visible text, and label associations. CSS classes and tag names may be used as fallbacks but are not the primary identification strategy — component libraries produce their own class names and DOM structures that differ across technologies.

This mirrors real-world production applications where `data-testid` attributes are rarely applied universally, and forces the test framework to use robust, production-realistic selector strategies that work regardless of the underlying component library.

### 7.2 Port Allocation

Each app runs on a dedicated port to allow parallel execution during framework testing.

| App | Port |
|-----|------|
| `vanilla-html` | 3001 |
| `react-app` | 3002 |
| `vue-app` | 3003 |
| `angular-app` | 3004 |
| `svelte-app` | 3005 |
| `nextjs-app` | 3006 |
| `lit-app` | 3007 |

> These are default assignments. Adjust if a port is already in use on your machine.

### 7.3 Start Command

Every app must be startable with:

```bash
cd apps/<app-name>
npm install   # first time only
npm start     # serves on assigned port
```

### 7.4 No Runtime Network Requests

- No runtime network requests to external APIs, CDNs, or third-party services.
- Third-party libraries (React, Lit, HTMX, etc.) must be bundled locally via `node_modules` and served from the dev server — this is allowed.
- All assets (CSS, JS, images) must be local or inlined.
- Simulated async behavior uses `setTimeout` / `Promise`, not real network calls.

### 7.5 Dependency Management

- **Lockfiles committed:** Every app's `package-lock.json` must be committed to the repo. This ensures reproducible installs across machines. Workspace packages (`framework`, `tools/crawler`) are managed by the root lockfile via npm workspaces and do not require standalone lockfiles.
- **Major versions pinned:** Use exact or tilde (`~`) ranges in `package.json` for framework dependencies (React, Vue, Angular, Svelte, Next.js, Lit, HTMX). Avoid caret (`^`) for major framework packages to prevent unintended breaking upgrades.
- **Shared tool versions:** All Vite-based apps (React, Vue, Svelte) should use the same Vite major version. Document the version in each app's README.
- **Upgrade policy:** Dependency upgrades are intentional, not automatic. When upgrading, update one app first, verify the UI contract still holds, then propagate to the others.

---

## 8. Success Criteria

This library is considered **complete for v0.1** when:

- [x] All 7 apps are implemented and conform to the UI contract (§6)
- [x] Each app starts with `npm start` on its assigned port
- [x] Each app follows the accessibility baseline in §6.4 (semantic HTML, labels, ARIA)
- [x] Each app has a local `README.md` documenting the technology, start command, and any caveats
- [x] All 7 apps can be started simultaneously via a root-level `start:all` script
- [x] Framework library (§11) is implemented and validated against vanilla-html
- [x] All 7 apps migrated to idiomatic component libraries (Phase 10) — 1,064/1,064 integration tests + 276 unit tests passing
- [x] Framework handles genuinely different DOM structures across 6 component libraries — library-specific logic is isolated in adapters (DatePickerAdapter, SelectAdapter) while detection uses generic ARIA/role-based strategies

---

## 9. Future Considerations (Not In Scope Now)

These items are explicitly deferred but documented for future planning:

| Item | Notes |
|------|-------|
| Repo split | Separate `playwright-elements` (runtime framework, npm package) from `autoPOM` (crawler/recorder/emitter tool). Fixture apps and dev scripts stay in the current repo. |
| `captureTraffic()` helper | Framework helper that wraps a UI action, captures all API requests/responses during it, and returns them for assertion (payload validation, call order, response schema). Extends the `networkSettleMiddleware` pattern to expose captured traffic instead of discarding it. |
| `--observe-network` default | Make API dependency observation the default during crawls so every manifest includes `apiDependencies` and every generated page object emits `waitForReady()`. |
| Interaction → endpoint attribution | Extend crawler's API observation to attribute which UI action triggered which endpoint. Surface in manifest metadata and as comments in generated page objects. |
| Agent-driven test generation | AI agent generates `.spec.ts` files from manifest + generated POM. The typed page object provides the structured API contract; the agent doesn't need raw HTML. |
| API mocking targets | Apps that consume a mock REST/GraphQL backend (MSW or similar) |
| Authentication UI | Login form, protected route patterns |
| Mobile-responsive targets | Viewport-specific behavior for mobile testing |
| i18n / Localization | Multi-language content switching |
| Iframe embedding | Apps that embed cross-origin or same-origin iframes |
| File upload / download | File interaction patterns |
| WebSocket / real-time UI | Live-updating content patterns |
| Complex forms | Multi-step forms, drag-and-drop, rich text editors |
| Micro-frontend targets | Multiple frameworks composed on one page |

---

## 10. Resolved Decisions

The following were originally open questions. Decisions recorded here for traceability.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | CSS framework variant? (e.g., Tailwind) | **Deferred to v0.2.** | The UI contract relies on semantic HTML, ARIA attributes, and CSS classes for element identification. A Tailwind variant can be added later if the framework team wants to validate selector robustness across different CSS methodologies. |
| Q2 | `vanilla-html` — dev server or `file://`? | **Dev server (`npx serve -l 3001`).** | `file://` breaks same-origin policies, disables ES module imports, and behaves differently from every other app. The test framework should not need special handling for one app's protocol quirk. |
| Q3 | TypeScript vs. JavaScript? | **TypeScript for all Vite/CLI-scaffolded apps; plain JavaScript for `vanilla-html` and `htmx-app`.** | TS is the default template for Vite, Angular CLI, and Next.js — fighting it creates friction. Vanilla-html and HTMX are intentionally zero-tooling; a TS compile step contradicts their purpose. |
| Q4 | Intentional bug page? | **Deferred — not in v0.1.** | The v0.1 focus is on building fully working UI contract implementations. An intentional bugs page can be added in a future version when the external test framework needs to validate failure detection. |
| Q5 | Node version pinning? | **Yes — `.nvmrc` at repo root, pinned to Node 20 LTS.** | 8 apps with independent `node_modules` and no version pinning will hit "works on my machine" issues. One file, zero ongoing cost. |
| Q6 | HTMX server dependency vs. G4 (no backend)? | **Permitted — use a minimal static file server (~30 lines Express) to serve HTML partials from a `/partials` directory.** | This is functionally identical to what `npx serve` does — a file server, not a backend. The partials are static assets, not API responses. HTMX's value is server-driven DOM updates; a client-only fake would test nothing `vanilla-html` doesn't already cover. **Acknowledged asymmetry:** the HTMX app is the only app requiring a custom `server.js` — every other app uses an off-the-shelf tool (Vite, `serve`, `next dev`, `ng serve`). The Express server must remain stateless, perform zero processing, and be documented in the HTMX app's README with a code review note confirming it is a pure file server. |
| Q7 | Next.js static export vs. SSR? | **Production build (`next build && next start -p 3006`).** | `output: 'export'` eliminates hydration and SSR behavior — the very things that justify Next.js's inclusion. The production build exercises real SSR + hydration. No API routes, no database — still satisfies G4. |
| Q8 | Lit Shadow DOM element identification? | **Dual placement — structural elements in light DOM (identifiable by semantic HTML), interactive elements inside shadow root (identifiable by semantic HTML, ARIA, and CSS classes).** | See §6.5. Putting everything on the host skips shadow DOM testing. Putting everything inside breaks the shared contract for structural selectors. The split gives the test framework both scenarios. |

---

## 11. Framework Library Design

> **Moved to [`framework/README.md`](../framework/README.md).** The full API design (By object, handler registry, group element, typed wrappers, technology adapters, error handling) is documented in the framework's own README. This section previously duplicated that content (~340 lines).

---

*This is a living document. Update it as decisions are made.*
