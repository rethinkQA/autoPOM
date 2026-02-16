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
│   └── REQUIREMENTS.md          ← this document
├── apps/
│   ├── vanilla-html/            ← plain HTML/CSS/JS, no build step
│   ├── react-app/               ← React (Vite)
│   ├── vue-app/                 ← Vue 3 (Vite)
│   ├── angular-app/             ← Angular (Angular CLI)
│   ├── svelte-app/              ← Svelte (Vite)
│   ├── nextjs-app/              ← Next.js (SSR dev mode, no API routes)
│   ├── lit-app/                 ← Lit web components
│   └── htmx-app/                ← HTMX (lightweight, hypermedia-driven)
├── shared/
│   └── ui-contract.md           ← defines the common testable surface
└── README.md
```

Each app is **self-contained** with its own `package.json` (or equivalent) and can be started independently.

---

## 5. Technology Matrix

These technologies were selected to stress-test different rendering and DOM interaction models that the Playwright framework must handle.

| App | Technology | Why It Matters to a Test Framework |
|-----|-----------|-----------------------------------|
| `vanilla-html` | HTML / CSS / JS (no framework) | Baseline — raw DOM, no virtual DOM, no lifecycle. Proves the framework doesn't accidentally depend on framework-specific behavior. |
| `react-app` | React 18+ (Vite) | Virtual DOM, synthetic events, async state updates, component re-renders. The most common SPA target. |
| `vue-app` | Vue 3 (Composition API, Vite) | Reactive proxy system, template-based rendering, transition system. |
| `angular-app` | Angular 17+ (standalone components) | Zone.js change detection, RxJS async patterns, strict typing, shadow DOM option. |
| `svelte-app` | Svelte 5+ (Vite) | Compile-time framework — no runtime library in the DOM. Tests that the framework doesn't rely on runtime framework globals. |
| `nextjs-app` | Next.js 14+ (SSR dev mode) | File-based routing, server-side rendering, hydration edge cases. Runs via `next dev` to exercise real SSR + hydration — validates that the test framework correctly waits for hydration before interacting with elements. |
| `lit-app` | Lit 3+ | Native Web Components, Shadow DOM by default. Critical for testing shadow DOM piercing/interaction strategies. |
| `htmx-app` | HTMX 2+ | No SPA — DOM mutations via HTML-over-the-wire. Validates that the framework handles non-JS-driven DOM updates. |

> **Note:** This list is intentionally opinionated. It covers the major rendering paradigms (virtual DOM, reactive, compiled, web components, hypermedia). Additional apps can be added later without disrupting existing ones.

---

## 6. UI Contract (Common Testable Surface)

Every application **must** implement the following UI elements and behaviors. This is the shared contract that allows framework tests to be written generically.

### 6.0 Application Theme — "GeneralStore"

All apps implement a fictional **"GeneralStore"** mini storefront. This thin theme gives every UI element a natural reason to exist without adding complexity. The theme is cosmetic — the `data-testid` contract is what matters.

| Page | Content | Notes |
|------|---------|-------|
| **Home** | Product catalog — a data table of products, search/filter input, category dropdown, quantity stepper, "Add to Cart" action button, shipping options, delivery date picker | All interactive elements from §6.2 live here |
| **About** | Store description — a short paragraph about GeneralStore | Must include `data-testid="about-text"` |

> The store theme should feel like a static prototype, not a working e-commerce app. No cart state persistence, no checkout flow, no real pricing logic. If an element needs to "do something" (e.g., Add to Cart), it displays a toast notification or updates an output display — nothing more.

#### Canonical Product Data

All 8 apps **must** use this exact dataset to ensure cross-app test assertions are consistent:

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

| Element | Requirement | Test Data Attribute |
|---------|-------------|---------------------|
| Header | Visible heading with store name and technology identifier | `data-testid="app-header"` |
| Navigation | At least 2 links/buttons that switch views/pages (Home, About) | `data-testid="nav-home"`, `data-testid="nav-about"` |
| Main content area | Container that changes based on current view | `data-testid="main-content"` |
| About content | Store description paragraph, visible on the About page | `data-testid="about-text"` |
| Footer | Static footer with text | `data-testid="app-footer"` |

### 6.2 Interactive Elements

| Element | Requirement | Store Context | Test Data Attribute |
|---------|-------------|---------------|---------------------|
| Text input | Single text field | Product search / filter input | `data-testid="text-input"` |
| Button (action) | Triggers a visible state change on click | "Add to Cart" button | `data-testid="action-button"` |
| Output display | Shows result of button click | Confirmation message (e.g., "Added Wireless Mouse") | `data-testid="action-output"` |
| Checkbox | Toggleable, affects visible state | "Show only in-stock items" filter | `data-testid="toggle-checkbox"` |
| Dropdown / Select | At least 3 options, selection reflected in UI | Product category filter (All, Electronics, Books, Clothing) | `data-testid="select-dropdown"` |
| Radio button group | Mutually exclusive options, selection affects visible state | Shipping method (Standard / Express / Overnight) with displayed cost | `data-testid="radio-group"` |
| Radio output | Displays the cost/label for the selected radio option | Shipping cost (e.g., "$4.99", "$9.99", "$19.99") | `data-testid="radio-output"` |
| Data table | Tabular data with at least 4 columns and 3+ rows | Product catalog (Name, Price, Category, Stock) | `data-testid="data-table"` |
| Date picker | Native `<input type="date">` in baseline; technology-native date picker in framework apps (see §6.7) | Delivery date selection | `data-testid="date-picker"` |
| Date output | Displays the formatted selected date | Chosen delivery date (e.g., "February 20, 2026") | `data-testid="date-output"` |
| Quantity stepper | Numeric input with increment/decrement controls (+/−) | Product quantity selector | `data-testid="quantity-input"` |
| Quantity increment | The "+" button of the quantity stepper | Increases quantity by 1 (disabled at 99) | `data-testid="quantity-increment"` |
| Quantity decrement | The "−" button of the quantity stepper | Decreases quantity by 1 (disabled at 1) | `data-testid="quantity-decrement"` |
| Modal trigger | Button or link that opens the modal dialog | "View Details" link/button on a product row | `data-testid="modal-trigger"` |
| Modal / Dialog | Overlay that opens and closes, contains content; native `<dialog>` in baseline, technology-native dialog in framework apps (see §6.7) | Product detail or order confirmation dialog | `data-testid="modal-dialog"` |
| Modal close | Button that closes the modal dialog | Close button inside the modal | `data-testid="modal-close"` |
| Toast / Notification | Temporary message that auto-dismisses after a timeout; custom in baseline, technology-native toast library in framework apps (see §6.7) | "Added to cart" feedback — **must** be triggered by `action-button` click (auto-dismiss after 3s) | `data-testid="toast-notification"` |

### 6.3 Dynamic Behaviors

| Behavior | Requirement | Details |
|----------|-------------|---------|
| Conditional rendering | An element that appears/disappears based on interaction | Toggled by checkbox (e.g., filtering in-stock products) |
| List rendering | A static or dynamically generated list of 3+ items | `data-testid="item-list"` |
| Delayed content | Content that appears after a simulated delay (setTimeout, not a real API) | 1–2 second delay, `data-testid="delayed-content"` (e.g., "Loading recommendations…") |
| Form validation | Inline validation message on empty submit | `data-testid="validation-message"` (e.g., "Please enter a search term") |
| Routing / View switching | Navigation changes visible content without full page reload (where applicable) | URL or hash changes for SPA apps |
| Table sorting | Clicking a column header sorts the data table by that column | `data-testid="table-sort"` on sortable column headers; toggles ascending/descending |
| Table filtering | Typing in the text input filters table rows in real time | `data-testid="table-filter"` is the **container element** (e.g., `<div>`) wrapping the filter controls (text input, dropdown, checkbox). `data-testid="text-input"` is the `<input>` element inside it. |
| Empty results | When all filters combined produce zero matching rows, the table body shows a single row spanning all columns with text "No products found." | `data-testid="empty-state"` on the empty-state row or message element |
| Date selection | Selecting a date in the date picker displays the chosen date in a visible output | Formatted date (e.g., "February 20, 2026") shown in `data-testid="date-output"` |
| Radio selection | Choosing a radio option updates a visible cost/label | e.g., selecting "Express" shows "$9.99" in `data-testid="radio-output"` |
| Modal lifecycle | `data-testid="modal-trigger"` opens the modal; `data-testid="modal-close"` or overlay click dismisses it | Modal must trap focus while open; uses `<dialog>` element where possible |
| Toast auto-dismiss | Toast appears on `action-button` click, then auto-dismisses after ~3 seconds | Must be visible long enough for assertion; uses `aria-live="polite"` |

### 6.4 Accessibility Baseline

| Requirement | Details |
|-------------|---------|
| Semantic HTML | Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<button>`, `<label>` |
| Labels | All inputs must have associated `<label>` elements |
| ARIA attributes | Conditional/dynamic content should use `aria-live` or `aria-hidden` as appropriate |
| Focus management | Keyboard-navigable interactive elements |

> This accessibility baseline is not exhaustive — it exists so the framework can validate accessibility-aware selector strategies (role-based locators, label-based locators, etc.).

### 6.5 Shadow DOM Handling (Lit and Web Component Apps)

| Placement | Elements | Rationale |
|-----------|----------|----------|
| **Host element (light DOM)** | Page-level structural elements: `app-header`, `nav-home`, `nav-about`, `about-text`, `main-content`, `app-footer` | Same top-level selectors work across all apps, including non-Shadow DOM apps |
| **Inside shadow root** | Interactive elements: `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `radio-output`, `data-table`, `table-sort`, `table-filter`, `empty-state`, `date-picker`, `date-output`, `quantity-input`, `quantity-increment`, `quantity-decrement`, `modal-trigger`, `modal-dialog`, `modal-close`, `toast-notification`, `item-list`, `delayed-content`, `validation-message` | Forces the test framework to demonstrate shadow DOM piercing |

The external test framework should use Playwright's built-in `>>` shadow DOM piercing (e.g., `locator('my-element >> [data-testid="action-button"]')`) rather than a custom abstraction.

> This dual-placement strategy ensures the test framework is validated against both light DOM and shadow DOM scenarios. Putting everything on the host would skip shadow DOM testing entirely; putting everything inside the shadow root would break the "one test suite, any app" promise for structural selectors.

### 6.6 Interaction Specifications

To ensure all 8 apps behave identically (enabling "one test suite, any app"), the following interaction rules apply:

| Interaction | Specification |
|-------------|---------------|
| **Filter composition** | Text input, category dropdown, and in-stock checkbox filters are AND-ed. A product must match all active filters to appear. |
| **Text input filter scope** | Filters against the product **Name** column only (case-insensitive, substring match). |
| **Default sort order** | Table rows are unsorted (insertion order) on initial load. |
| **Sort toggle behavior** | First click on a column header → ascending. Second click → descending. Third click → back to ascending. No neutral/unsorted toggle. |
| **Empty results** | When filters produce zero matching rows, the table body shows a single row spanning all columns with the text "No products found." (`data-testid="empty-state"`) |
| **Quantity stepper bounds** | Minimum value: `1`. Maximum value: `99`. The `−` button is disabled at 1; the `+` button is disabled at 99. Default value on load: `1`. |

> These rules are intentionally minimal. The goal is behavioral consistency across apps, not feature richness.

### 6.7 Technology-Native Components

The `vanilla-html` app uses only native HTML elements (`<input type="date">`, `<dialog>`, `<select>`, etc.) and serves as the **pure baseline**. Framework apps should use **idiomatic, technology-native component libraries** for select UI elements. This ensures the test framework is validated against the kind of DOM structures teams actually ship in production, not just native HTML wrappers.

#### Principles

1. **`data-testid` contract is unchanged.** Every element still carries its required `data-testid` regardless of implementation. The test framework uses these as anchors.
2. **Behavioral contract is unchanged.** Same inputs produce same outputs — filter logic, sort order, stepper bounds, toast timing, etc. The *what* doesn't change; the *how* changes.
3. **Interaction model becomes technology-aware.** The test framework must abstract over different DOM structures to verify identical outcomes. For example, selecting a date in a native `<input type="date">` uses `page.fill()`, while a React datepicker requires clicking to open, navigating months, and clicking a day cell.
4. **Data table stays native `<table>`.** Framework table components (AG Grid, TanStack Table, etc.) add too much scope and complexity. Native `<table>` is sufficient to validate table interactions and keeps the apps trivially simple (G2).

#### Component Matrix

| Element | `vanilla-html` | `react-app` | `vue-app` | `angular-app` | `svelte-app` | `nextjs-app` | `lit-app` | `htmx-app` |
|---------|---------------|-------------|-----------|---------------|-------------|-------------|---------|------------|
| Date picker | Native `<input type="date">` | `react-datepicker` | `vue-datepicker` | Angular Material `mat-datepicker` | `svelte-flatpickr` or similar | `react-datepicker` | Native `<input type="date">` | Native `<input type="date">` |
| Modal / Dialog | Native `<dialog>` | MUI `Dialog` or Headless UI | Headless UI Vue or Vuetify dialog | Angular CDK `Dialog` | Svelte Headless UI or custom | MUI `Dialog` or Headless UI | Native `<dialog>` (Shadow DOM) | Native `<dialog>` |
| Toast | Custom `<div>` | `react-hot-toast` or `sonner` | `vue-toastification` | Angular Material `MatSnackBar` | `svelte-french-toast` or similar | `react-hot-toast` or `sonner` | Custom (Shadow DOM) | Custom `<div>` |
| Select / Dropdown | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` |

> **Select stays native everywhere.** Custom dropdowns (Headless UI Listbox, MUI Select, etc.) can be added in a future version (v0.2+) if the framework team wants to validate custom-dropdown interaction strategies. For v0.1, native `<select>` provides consistent behavior with minimal complexity.
>
> **Lit and HTMX stay fully native.** Lit's purpose is Shadow DOM testing, not component library testing. HTMX is intentionally zero-JS-framework. Neither benefits from third-party UI components.
>
> **Library choices are suggestions, not mandates.** The specific library for each cell can be adjusted based on ecosystem health at build time. The requirement is that the app uses a **technology-idiomatic component**, not a specific package.

#### Impact on Testing Strategy

With this change, the framework's testing strategy shifts from:
- ❌ "One test suite with identical interactions for all apps"

To:
- ✅ "One **assertion set** (verify same outcomes via `data-testid` anchors) with **technology-aware interactions** (different click/input sequences per component type)"

This is a more realistic model of how production test frameworks operate. The framework should expose a component-aware abstraction layer (e.g., `datePicker.select(date)` that dispatches to the right interaction strategy based on the detected component type).

---

## 7. Conventions

### 7.1 Data Attributes

All apps **must** use `data-testid` attributes as defined in §6. This is the primary stable selector strategy. The framework will also test CSS, XPath, role-based, and text-based selectors, but `data-testid` is the guaranteed contract.

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
| `htmx-app` | 3008 |

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

- **Lockfiles committed:** Every app's `package-lock.json` must be committed to the repo. This ensures reproducible installs across machines.
- **Major versions pinned:** Use exact or tilde (`~`) ranges in `package.json` for framework dependencies (React, Vue, Angular, Svelte, Next.js, Lit, HTMX). Avoid caret (`^`) for major framework packages to prevent unintended breaking upgrades.
- **Shared tool versions:** All Vite-based apps (React, Vue, Svelte) should use the same Vite major version. Document the version in each app's README.
- **Upgrade policy:** Dependency upgrades are intentional, not automatic. When upgrading, update one app first, verify the UI contract still holds, then propagate to the others.

---

## 8. Success Criteria

This library is considered **complete for v0.1** when:

- [ ] All 8 apps are implemented and conform to the UI contract (§6)
- [ ] Each app starts with `npm start` on its assigned port
- [ ] Each app's `data-testid` attributes match the contract exactly
- [ ] Each app follows the accessibility baseline in §6.4 (semantic HTML, labels, ARIA)
- [ ] Each app has a local `README.md` documenting the technology, start command, and any caveats
- [ ] All 8 apps can be started simultaneously via a root-level `start:all` script

---

## 9. Future Considerations (Not In Scope Now)

These items are explicitly deferred but documented for future planning:

| Item | Notes |
|------|-------|
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
| Q1 | CSS framework variant? (e.g., Tailwind) | **Deferred to v0.2.** | The UI contract mandates `data-testid` as the primary selector strategy, which is immune to CSS class changes. A Tailwind variant can be added later if the framework team wants to validate CSS/XPath selector robustness. |
| Q2 | `vanilla-html` — dev server or `file://`? | **Dev server (`npx serve -l 3001`).** | `file://` breaks same-origin policies, disables ES module imports, and behaves differently from every other app. The test framework should not need special handling for one app's protocol quirk. |
| Q3 | TypeScript vs. JavaScript? | **TypeScript for all Vite/CLI-scaffolded apps; plain JavaScript for `vanilla-html` and `htmx-app`.** | TS is the default template for Vite, Angular CLI, and Next.js — fighting it creates friction. Vanilla-html and HTMX are intentionally zero-tooling; a TS compile step contradicts their purpose. |
| Q4 | Intentional bug page? | **Deferred — not in v0.1.** | The v0.1 focus is on building fully working UI contract implementations. An intentional bugs page can be added in a future version when the external test framework needs to validate failure detection. |
| Q5 | Node version pinning? | **Yes — `.nvmrc` at repo root, pinned to Node 20 LTS.** | 8 apps with independent `node_modules` and no version pinning will hit "works on my machine" issues. One file, zero ongoing cost. |
| Q6 | HTMX server dependency vs. G4 (no backend)? | **Permitted — use a minimal static file server (~30 lines Express) to serve HTML partials from a `/partials` directory.** | This is functionally identical to what `npx serve` does — a file server, not a backend. The partials are static assets, not API responses. HTMX's value is server-driven DOM updates; a client-only fake would test nothing `vanilla-html` doesn't already cover. **Acknowledged asymmetry:** the HTMX app is the only app requiring a custom `server.js` — every other app uses an off-the-shelf tool (Vite, `serve`, `next dev`, `ng serve`). The Express server must remain stateless, perform zero processing, and be documented in the HTMX app's README with a code review note confirming it is a pure file server. |
| Q7 | Next.js static export vs. SSR? | **SSR dev mode (`next dev -p 3006`).** | `output: 'export'` eliminates hydration and SSR behavior — the very things that justify Next.js's inclusion. `next dev` is a dev server (same as Vite), not a production backend. No API routes, no database — still satisfies G4. |
| Q8 | Lit Shadow DOM `data-testid` placement? | **Dual placement — structural elements on host (light DOM), interactive elements inside shadow root.** | See §6.5. Putting everything on the host skips shadow DOM testing. Putting everything inside breaks the shared contract for structural selectors. The split gives the test framework both scenarios. |

---

*This is a living document. Update it as decisions are made.*
