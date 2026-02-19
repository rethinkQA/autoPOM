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
│   └── FRAMEWORK_DESIGN.md      ← framework library API design
├── apps/
│   ├── vanilla-html/            ← plain HTML/CSS/JS, no build step
│   ├── react-app/               ← React (Vite)
│   ├── vue-app/                 ← Vue 3 (Vite)
│   ├── angular-app/             ← Angular (Angular CLI)
│   ├── svelte-app/              ← Svelte (Vite)
│   ├── nextjs-app/              ← Next.js (SSR dev mode, no API routes)
│   └── lit-app/                 ← Lit web components
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
| Date picker | Native `<input type="date">` in baseline; technology-native date picker in framework apps (see §6.7) | Delivery date selection |
| Date output | Displays the formatted selected date | Chosen delivery date (e.g., "February 20, 2026") |
| Quantity stepper | Numeric input with increment/decrement controls (+/−) | Product quantity selector |
| Quantity increment | The "+" button of the quantity stepper | Increases quantity by 1 (disabled at 99) |
| Quantity decrement | The "−" button of the quantity stepper | Decreases quantity by 1 (disabled at 1) |
| Modal trigger | Button or link that opens the modal dialog | "View Details" link/button on a product row |
| Modal / Dialog | Overlay that opens and closes, contains content; native `<dialog>` in baseline, technology-native dialog in framework apps (see §6.7) | Product detail or order confirmation dialog |
| Modal close | Button that closes the modal dialog | Close button inside the modal |
| Toast / Notification | Temporary message that auto-dismisses after a timeout; custom in baseline, technology-native toast library in framework apps (see §6.7) | "Added to cart" feedback — **must** be triggered by `action-button` click (auto-dismiss after 3s) |

### 6.3 Dynamic Behaviors

| Behavior | Requirement | Details |
|----------|-------------|---------|
| Conditional rendering | An element that appears/disappears based on interaction | Toggled by checkbox (e.g., filtering in-stock products) |
| List rendering | A static or dynamically generated list of 3+ items | Identified by list semantic elements (`<ul>`/`<ol>`) or `class="item-list"` |
| Delayed content | Content that appears after a simulated delay (setTimeout, not a real API) | 1–2 second delay, identified by `class="delayed-content"` or `aria-live` region (e.g., "Loading recommendations…") |
| Form validation | Inline validation message on empty submit | Identified by `role="alert"` or `class="validation-message"` (e.g., "Please enter a search term") |
| Routing / View switching | Navigation changes visible content without full page reload (where applicable) | URL or hash changes for SPA apps |
| Table sorting | Clicking a column header sorts the data table by that column | Sortable column headers identified by `<th>` elements with `aria-sort`; toggles ascending/descending |
| Table filtering | Typing in the text input filters table rows in real time | The filter controls container (e.g., `<div class="table-filter">`) wraps the text input, dropdown, and checkbox. The `<input>` element inside it is identified by its `<label>` or `role`. |
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

The `vanilla-html` app uses only native HTML elements (`<input type="date">`, `<dialog>`, `<select>`, etc.) and serves as the **pure baseline**. Framework apps should use **idiomatic, technology-native component libraries** for select UI elements. This ensures the test framework is validated against the kind of DOM structures teams actually ship in production, not just native HTML wrappers.

#### Principles

1. **Element identification contract is unchanged.** Every element is still identifiable by its semantic HTML, ARIA attributes, CSS classes, or native DOM structure regardless of implementation. The test framework uses these native anchors.
2. **Behavioral contract is unchanged.** Same inputs produce same outputs — filter logic, sort order, stepper bounds, toast timing, etc. The *what* doesn't change; the *how* changes.
3. **Interaction model becomes technology-aware.** The test framework must abstract over different DOM structures to verify identical outcomes. For example, selecting a date in a native `<input type="date">` uses `page.fill()`, while a React datepicker requires clicking to open, navigating months, and clicking a day cell.
4. **Data table stays native `<table>`.** Framework table components (AG Grid, TanStack Table, etc.) add too much scope and complexity. Native `<table>` is sufficient to validate table interactions and keeps the apps trivially simple (G2).

#### Component Matrix

| Element | `vanilla-html` | `react-app` | `vue-app` | `angular-app` | `svelte-app` | `nextjs-app` | `lit-app` |
|---------|---------------|-------------|-----------|---------------|-------------|-------------|----------|
| Date picker | Native `<input type="date">` | `react-datepicker` | `vue-datepicker` | Angular Material `mat-datepicker` | `svelte-flatpickr` or similar | `react-datepicker` | Native `<input type="date">` |
| Modal / Dialog | Native `<dialog>` | MUI `Dialog` or Headless UI | Headless UI Vue or Vuetify dialog | Angular CDK `Dialog` | Svelte Headless UI or custom | MUI `Dialog` or Headless UI | Native `<dialog>` (Shadow DOM) |
| Toast | Custom `<div>` | `react-hot-toast` or `sonner` | `vue-toastification` | Angular Material `MatSnackBar` | `svelte-french-toast` or similar | `react-hot-toast` or `sonner` | Custom (Shadow DOM) |
| Select / Dropdown | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` |

> **Select stays native everywhere.** Custom dropdowns (Headless UI Listbox, MUI Select, etc.) can be added in a future version (v0.2+) if the framework team wants to validate custom-dropdown interaction strategies. For v0.1, native `<select>` provides consistent behavior with minimal complexity.
>
> **Lit stays fully native.** Lit's purpose is Shadow DOM testing, not component library testing. It doesn't benefit from third-party UI components.
>
> **Library choices are suggestions, not mandates.** The specific library for each cell can be adjusted based on ecosystem health at build time. The requirement is that the app uses a **technology-idiomatic component**, not a specific package.

#### Impact on Testing Strategy

With this change, the framework's testing strategy shifts from:
- ❌ "One test suite with identical interactions for all apps"

To:
- ✅ "One **assertion set** (verify same outcomes via semantic selectors) with **technology-aware interactions** (different click/input sequences per component type)"

This is a more realistic model of how production test frameworks operate. The framework should expose a component-aware abstraction layer (e.g., `datePicker.select(date)` that dispatches to the right interaction strategy based on the detected component type).

---

## 7. Conventions

### 7.1 Element Identification Strategy

Apps do **not** use `data-testid` attributes. Instead, elements are identified using their **native rendered DOM**: semantic HTML elements (`<button>`, `<input>`, `<table>`, `<dialog>`, etc.), ARIA attributes (`aria-label`, `aria-sort`, `aria-live`, `role`), CSS classes, labels, and framework-specific DOM structures. This mirrors real-world production applications where `data-testid` attributes are rarely applied universally, and forces the test framework to use robust, production-realistic selector strategies.

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

- **Lockfiles committed:** Every app's `package-lock.json` must be committed to the repo. This ensures reproducible installs across machines.
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
- [ ] Framework library (§11) is implemented and validated against vanilla-html

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
| Q1 | CSS framework variant? (e.g., Tailwind) | **Deferred to v0.2.** | The UI contract relies on semantic HTML, ARIA attributes, and CSS classes for element identification. A Tailwind variant can be added later if the framework team wants to validate selector robustness across different CSS methodologies. |
| Q2 | `vanilla-html` — dev server or `file://`? | **Dev server (`npx serve -l 3001`).** | `file://` breaks same-origin policies, disables ES module imports, and behaves differently from every other app. The test framework should not need special handling for one app's protocol quirk. |
| Q3 | TypeScript vs. JavaScript? | **TypeScript for all Vite/CLI-scaffolded apps; plain JavaScript for `vanilla-html` and `htmx-app`.** | TS is the default template for Vite, Angular CLI, and Next.js — fighting it creates friction. Vanilla-html and HTMX are intentionally zero-tooling; a TS compile step contradicts their purpose. |
| Q4 | Intentional bug page? | **Deferred — not in v0.1.** | The v0.1 focus is on building fully working UI contract implementations. An intentional bugs page can be added in a future version when the external test framework needs to validate failure detection. |
| Q5 | Node version pinning? | **Yes — `.nvmrc` at repo root, pinned to Node 20 LTS.** | 8 apps with independent `node_modules` and no version pinning will hit "works on my machine" issues. One file, zero ongoing cost. |
| Q6 | HTMX server dependency vs. G4 (no backend)? | **Permitted — use a minimal static file server (~30 lines Express) to serve HTML partials from a `/partials` directory.** | This is functionally identical to what `npx serve` does — a file server, not a backend. The partials are static assets, not API responses. HTMX's value is server-driven DOM updates; a client-only fake would test nothing `vanilla-html` doesn't already cover. **Acknowledged asymmetry:** the HTMX app is the only app requiring a custom `server.js` — every other app uses an off-the-shelf tool (Vite, `serve`, `next dev`, `ng serve`). The Express server must remain stateless, perform zero processing, and be documented in the HTMX app's README with a code review note confirming it is a pure file server. |
| Q7 | Next.js static export vs. SSR? | **SSR dev mode (`next dev -p 3006`).** | `output: 'export'` eliminates hydration and SSR behavior — the very things that justify Next.js's inclusion. `next dev` is a dev server (same as Vite), not a production backend. No API routes, no database — still satisfies G4. |
| Q8 | Lit Shadow DOM element identification? | **Dual placement — structural elements in light DOM (identifiable by semantic HTML), interactive elements inside shadow root (identifiable by semantic HTML, ARIA, and CSS classes).** | See §6.5. Putting everything on the host skips shadow DOM testing. Putting everything inside breaks the shared contract for structural selectors. The split gives the test framework both scenarios. |

---

---

## 11. Framework Library Design

The test apps exist to validate a **Playwright-based element interaction library**. This section documents the API design that the framework should implement.

### 11.1 Core Architecture

The framework has four layers, with a clean separation between data and code:

```
┌─────────────────────────────────────────────┐
│  Page Elements (data)                       │
│  "what exists and where, with nesting"      │
│  { name: { type, by, children? } }          │
├─────────────────────────────────────────────┤
│  By Object (data)                           │
│  "how to locate an element"                 │
│  By.label(), By.role(), By.css(), etc.      │
├─────────────────────────────────────────────┤
│  Element Types (code)                       │
│  "typed operations per element kind"        │
│  checkbox.check(), table.rows(), etc.       │
├─────────────────────────────────────────────┤
│  Technology Adapters (code)                 │
│  "how operations differ per framework"      │
│  datePicker.select() → different DOM ops    │
└─────────────────────────────────────────────┘
```

| Layer | Is Data? | Changes when... |
|---|---|---|
| Page Elements | Yes (dict/JSON) | Page layout changes |
| By Object | Yes (data) | Selector strategy changes |
| Element Types | No (code) | New element kind added |
| Technology Adapters | No (code) | New framework app added |

### 11.2 `By` Object — Element Identification

A `By` object formalizes the identification strategy as a first-class concept. Each factory method declares *how* to locate the element, mapping directly to the identification strategies in §7.1.

```ts
By.label("In stock only")              // associated <label> text
By.role("checkbox", { name: "..." })   // ARIA role + accessible name
By.css(".filter-bar input")            // CSS selector
By.text("Add to Cart")                 // visible text content
By.semantic("select")                  // semantic HTML element type
By.shadow("host-element", "button")    // shadow DOM piercing
By.within(parentBy, childBy)           // scoped lookup
By.first(by1, by2, by3)               // fallback chain
```

| UI Contract strategy (§7.1) | `By` factory |
|---|---|
| Semantic HTML | `By.semantic("table")`, `By.semantic("dialog")` |
| ARIA attributes | `By.role("button", { name: "..." })` |
| CSS classes | `By.css(".action-output")`, `By.css(".date-output")` |
| Labels | `By.label("In stock only")` |
| Text content | `By.text("Add to Cart")` |
| Shadow DOM (§6.5) | `By.shadow(host, innerSelector)` |

The `By` object resolves to a Playwright `Locator` internally.

### 11.3 Typed Element Wrappers

Each element type is a factory function that takes a `By` and returns a typed object with operations specific to that element kind.

```ts
// Checkbox
checkbox(By.label("In stock only")).check()       // set checked
checkbox(By.label("In stock only")).uncheck()     // clear checked
checkbox(By.label("In stock only")).read()         // → boolean

// Select (native <select>)
select(By.semantic("select")).choose("Clothing")
select(By.semantic("select")).read()               // → "Clothing"

// Button
button(By.text("Add to Cart")).click()

// Text / Output
text(By.css(".action-output")).read()              // → "Added Wireless Mouse"

// Data Table
table(By.semantic("table")).sort("Price")
table(By.semantic("table")).rows()                 // → array of row data
table(By.semantic("table")).rowCount()              // → number

// Quantity Stepper
stepper(By.role("spinbutton")).increment()
stepper(By.role("spinbutton")).decrement()
stepper(By.role("spinbutton")).set(5)
stepper(By.role("spinbutton")).read()               // → 5

// Date Picker (technology-aware via adapter)
datePicker(By.label("Delivery date")).select("2026-02-20")
datePicker(By.label("Delivery date")).read()        // → "February 20, 2026"

// Radio Group
radio(By.css(".radio-group")).choose("Express")
radio(By.css(".radio-group")).read()                // → "Express"

// Dialog / Modal
dialog(By.semantic("dialog")).open()
dialog(By.semantic("dialog")).close()
dialog(By.semantic("dialog")).isOpen()              // → boolean

// Toast
toast(By.css("[aria-live='polite']")).read()        // → "Added Wireless Mouse"
toast(By.css("[aria-live='polite']")).isVisible()   // → boolean
```

Each typed wrapper encapsulates:
1. **Identification** — how to find the element (via `By`)
2. **Interaction** — how to operate it (technology-aware via adapter)
3. **Assertion** — how to read its state (what `.read()` returns)

### 11.4 Page Element Dictionaries

Page elements are declared as data dictionaries — essentially **page objects as data**. The dictionary defines what exists; `resolve()` hydrates it into typed elements.

```ts
const homePage = {
  inStockFilter:  { type: "checkbox",   by: { label: "In stock only" } },
  categoryFilter: { type: "select",     by: { semantic: "select" } },
  productTable:   { type: "table",      by: { semantic: "table" } },
  addToCart:       { type: "button",     by: { text: "Add to Cart" } },
  quantity:        { type: "stepper",    by: { role: "spinbutton" } },
  shipping:        { type: "radio",      by: { css: ".radio-group" } },
  deliveryDate:    { type: "datePicker", by: { label: "Delivery date" } },
  actionOutput:    { type: "text",       by: { css: ".action-output" } },
  shippingCost:    { type: "text",       by: { css: ".radio-output" } },
  dateDisplay:     { type: "text",       by: { css: ".date-output" } },
}

const home = pageElements(homePage)
home.inStockFilter.check()
home.categoryFilter.choose("Clothing")
const rows = home.productTable.rows()
```

### 11.5 Nested Elements / Scoping

For elements that contain children (cards, list items, table rows), the dictionary supports `children` and scoped lookups:

```ts
const page = {
  productCards: {
    type: "list",
    by: { css: ".product-cards" },
    children: {
      name:      { type: "text",    by: { css: ".card-title" } },
      price:     { type: "text",    by: { css: ".card-price" } },
      quantity:  { type: "stepper", by: { role: "spinbutton" } },
      addToCart: { type: "button",  by: { text: "Add to Cart" } },
    }
  }
}

// By index — scopes child lookups within the nth parent
home.productCards.nth(0).name.read()          // → "Wireless Mouse"
home.productCards.nth(0).addToCart.click()

// By content match
home.productCards.containing({ name: "Running Shoes" }).addToCart.click()
```

### 11.6 Technology Adapters

The same logical operation (e.g., "select a date") requires different physical interactions depending on the component library used. Technology adapters handle this dispatch transparently.

```ts
// datePicker.select("2026-02-20") internally:
//   vanilla-html  → page.fill(locator, "2026-02-20")     (native <input type="date">)
//   react-app     → click open → navigate month → click day cell (react-datepicker)
//   angular-app   → click toggle → navigate → click day (mat-datepicker)
```

Adapters map to the Component Matrix in §6.7. Build native-only adapters first (covers vanilla-html, lit-app), then add framework-specific adapters incrementally.

### 11.7 Build Order

| Phase | What | Validates against |
|---|---|---|
| 1 | `By` class + core element types (checkbox, select, button, text) | vanilla-html |
| 2 | Page element dictionary + `resolve()` | vanilla-html |
| 3 | Table element type (sort, filter, rows) | vanilla-html |
| 4 | Remaining types (stepper, datePicker, dialog, toast, radio) | vanilla-html |
| 5 | Nested elements / scoping | vanilla-html |
| 6 | Run same tests against react-app — see what breaks | react-app |
| 7 | First technology adapter (react-datepicker) based on real failures | react-app |
| 8 | Repeat for remaining apps | vue, angular, svelte, nextjs, lit |

> **Principle:** Build against vanilla-html first. It uses all native elements, so the adapters are trivial. Framework-specific adapters are discovered by running the same tests against framework apps and fixing what breaks.

---

*This is a living document. Update it as decisions are made.*
