# UI Contract — Common Testable Surface

> Extracted from [REQUIREMENTS.md](../docs/REQUIREMENTS.md) §6.
> This is the standalone reference used when building each app.

---

## Application Theme — "GeneralStore"

All apps implement a fictional **"GeneralStore"** mini storefront. The theme is cosmetic — the semantic contract (HTML structure, ARIA attributes, CSS classes) is what matters.

| Page | Content | Notes |
|------|---------|-------|
| **Home** | Product catalog — data table, search/filter, category dropdown, quantity stepper, "Add to Cart" button, shipping options, delivery date picker | All interactive elements live here |
| **About** | Store description — a short paragraph about GeneralStore | Must include `class="about-text"` |

> The store theme should feel like a static prototype, not a working e-commerce app. No cart state persistence, no checkout flow, no real pricing logic. If an element needs to "do something" (e.g., Add to Cart), it displays a toast notification or updates an output display — nothing more.

### Canonical Product Data

All apps **must** use this exact dataset:

| Name | Price | Category | In Stock |
|------|-------|----------|----------|
| Wireless Mouse | 29.99 | Electronics | Yes |
| Bluetooth Keyboard | 49.99 | Electronics | Yes |
| USB-C Hub | 39.99 | Electronics | No |
| Running Shoes | 89.99 | Clothing | Yes |
| Winter Jacket | 129.99 | Clothing | No |
| Cooking Basics | 24.99 | Books | Yes |
| Science Fiction Novel | 14.99 | Books | Yes |

> **Category dropdown values:** "All" (default — shows everything), "Electronics", "Books", "Clothing" — in this order.
>
> **In Stock mapping:** "Yes" = boolean `true`, "No" = boolean `false`. Used by the checkbox filter.
>
> **Price display:** Always formatted as `$XX.XX` (US dollar sign, two decimal places).

---

## Page Structure

| Element | Requirement |
|---------|-------------|
| Header | Visible heading with store name and technology identifier |
| Navigation | At least 2 links/buttons that switch views/pages (Home, About) |
| Main content area | Container that changes based on current view |
| About content | Store description paragraph, visible on the About page |
| Footer | Static footer with text |

---

## Interactive Elements

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
| Date picker | Native `<input type="date">`, selection reflected in UI | Delivery date selection |
| Date output | Displays the formatted selected date | Chosen delivery date (e.g., "February 20, 2026") |
| Quantity stepper | Numeric input with increment/decrement controls (+/−) | Product quantity selector |
| Quantity increment | The "+" button of the quantity stepper | Increases quantity by 1 (disabled at 99) |
| Quantity decrement | The "−" button of the quantity stepper | Decreases quantity by 1 (disabled at 1) |
| Modal trigger | Button or link that opens the modal dialog | "View Details" link/button on a product row |
| Modal / Dialog | Overlay that opens and closes, contains content | Product detail or order confirmation dialog |
| Modal close | Button that closes the modal dialog | Close button inside the modal |
| Toast / Notification | Temporary message that auto-dismisses after a timeout | "Added to cart" feedback — **must** be triggered by action button click (auto-dismiss after 3s) |

---

## Dynamic Behaviors

| Behavior | Requirement | Details |
|----------|-------------|---------|
| Conditional rendering | An element that appears/disappears based on interaction | Toggled by checkbox (e.g., filtering in-stock products) |
| List rendering | A static or dynamically generated list of 3+ items | `class="item-list"` |
| Delayed content | Content that appears after a simulated delay (setTimeout, not a real API) | 1–2 second delay, identified by `aria-live` attribute (e.g., "Loading recommendations…") |
| Form validation | Inline validation message on empty submit | Identified by `class="validation-message"` and `aria-live` (e.g., "Please enter a search term") |
| Routing / View switching | Navigation changes visible content without full page reload (where applicable) | URL or hash changes for SPA apps |
| Table sorting | Clicking a column header sorts the data table by that column | Sortable column headers use `th[data-sort-key]` with `role="button"`; toggles ascending/descending |
| Table filtering | Typing in the text input filters table rows in real time | `class="filter-bar"` is the **container element** (e.g., `<div>`) wrapping the filter controls. The text `<input>` inside the filter bar is the search field. |
| Empty results | When all filters combined produce zero matching rows, the table body shows a single row spanning all columns with text "No products found." | Identified by `class="empty-state"` on the empty-state row or message element |
| Date selection | Selecting a date in the date picker displays the chosen date in a visible output | Formatted date (e.g., "February 20, 2026") shown in `class="date-output"` element |
| Radio selection | Choosing a radio option updates a visible cost/label | e.g., selecting "Express" shows "$9.99" in `class="radio-output"` element |
| Modal lifecycle | Product name button/link opens the modal; close button inside `<dialog>` or `role="dialog"` dismisses it | Modal must trap focus while open; uses `<dialog>` element where possible |
| Toast auto-dismiss | Toast appears on action button click, then auto-dismisses after ~3 seconds | Must be visible long enough for assertion; uses `aria-live="polite"` |

---

## Accessibility Baseline

| Requirement | Details |
|-------------|---------|
| Semantic HTML | Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<button>`, `<label>` |
| Labels | All inputs must have associated `<label>` elements |
| ARIA attributes | Conditional/dynamic content should use `aria-live` or `aria-hidden` as appropriate |
| Focus management | Keyboard-navigable interactive elements |

---

## Shadow DOM Handling (Lit and Web Component Apps Only)

Structural elements — header, navigation, footer, main content area, and about text — live in the **light DOM** so that the same top-level selectors work across all apps. Interactive elements — inputs, buttons, the data table, dialogs, toasts, and all other form/filter controls — are rendered **inside shadow roots** and are identified by semantic HTML elements and ARIA attributes rather than data attributes. Test frameworks must pierce shadow boundaries to reach them.

---

## Interaction Specifications

| Interaction | Specification |
|-------------|---------------|
| **Filter composition** | Text input, category dropdown, and in-stock checkbox filters are AND-ed. A product must match all active filters to appear. |
| **Text input filter scope** | Filters against the product **Name** column only (case-insensitive, substring match). |
| **Default sort order** | Table rows are unsorted (insertion order) on initial load. |
| **Sort toggle behavior** | First click → ascending. Second click → descending. Third click → back to ascending. No neutral/unsorted toggle. |
| **Empty results** | When filters produce zero matching rows, show a single row spanning all columns: "No products found." (`class="empty-state"`) |
| **Quantity stepper bounds** | Min: `1`, Max: `99`. `−` disabled at 1; `+` disabled at 99. Default: `1`. |

---

## Technology-Native Components

The `vanilla-html` app uses only native HTML elements and serves as the **pure baseline**. Framework apps use **idiomatic, technology-native component libraries** for select UI elements, ensuring the test framework is validated against real-world DOM structures.

### Rules

1. **Element identification is semantic.** Every element is identified via semantic HTML, ARIA attributes, and CSS classes regardless of implementation.
2. **Behavioral contract is unchanged.** Same inputs → same outputs.
3. **Interaction model becomes technology-aware.** The test framework abstracts over different DOM structures to verify identical outcomes.
4. **Data table stays native `<table>` everywhere.** Select stays native `<select>` everywhere.

### Component Matrix

| Element | `vanilla-html` | `react-app` | `vue-app` | `angular-app` | `svelte-app` | `nextjs-app` | `lit-app` |
|---------|---------------|-------------|-----------|---------------|-------------|-------------|----------|
| Date picker | Native `<input type="date">` | `react-datepicker` | `vue-datepicker` | Angular Material `mat-datepicker` | `svelte-flatpickr` or similar | `react-datepicker` | Native `<input type="date">` |
| Modal / Dialog | Native `<dialog>` | MUI `Dialog` or Headless UI | Headless UI Vue or Vuetify | Angular CDK `Dialog` | Svelte Headless UI or custom | MUI `Dialog` or Headless UI | Native `<dialog>` (Shadow DOM) |
| Toast | Custom `<div>` | `react-hot-toast` or `sonner` | `vue-toastification` | Angular Material `MatSnackBar` | `svelte-french-toast` or similar | `react-hot-toast` or `sonner` | Custom (Shadow DOM) |
| Select | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` | Native `<select>` |

> Lit and HTMX stay fully native. Library choices are suggestions — the requirement is **technology-idiomatic**, not a specific package.

### Testing Strategy

One **assertion set** (verify outcomes via semantic selectors) with **technology-aware interactions** (different click/input sequences per component type).

---

## Element Identification Reference

Quick-reference for how each UI element is identified (no `data-testid` attributes):

### Page Structure
- **Header** — `<header>` element with store name
- **Home nav** — `<a>` or `<button>` within `<nav>`, linking to Home
- **About nav** — `<a>` or `<button>` within `<nav>`, linking to About
- **Main content** — `<main>` element
- **About text** — `class="about-text"` paragraph
- **Footer** — `<footer>` element

### Interactive Elements
- **Text input** — `<input>` inside `class="filter-bar"` container
- **Action button** — `<button>` with text "Add to Cart"
- **Action output** — `class="action-output"` element (confirmation message)
- **Checkbox** — `<input type="checkbox">` with associated `<label>` ("In stock only")
- **Category dropdown** — `<select>` element with category options
- **Radio group** — `<fieldset>` or container with `<input type="radio">` elements for shipping
- **Radio output** — `class="radio-output"` element (shipping cost display)
- **Data table** — `<table>` element (product catalog)
- **Sortable headers** — `<th>` elements with `data-sort-key` attribute and `role="button"`
- **Filter container** — `class="filter-bar"` wrapping filter controls
- **Empty state** — `class="empty-state"` element ("No products found")
- **Date picker** — `<input type="date">` element
- **Date output** — `class="date-output"` element (formatted date display)
- **Quantity input** — `<input type="number">` for quantity
- **Quantity increment** — `<button>` with text "+" or `aria-label="Increase quantity"`
- **Quantity decrement** — `<button>` with text "−" or `aria-label="Decrease quantity"`
- **Modal trigger** — Product name `<button>` or `<a>` in table row
- **Modal dialog** — `<dialog>` element or `role="dialog"`
- **Modal close** — Close `<button>` inside the dialog
- **Toast notification** — Element with `aria-live="polite"` (auto-dismissing)

### Dynamic Content
- **Item list** — `class="item-list"` element (3+ items)
- **Delayed content** — Identified by `aria-live` attribute (appears after delay)
- **Validation message** — `class="validation-message"` with `aria-live` (form error)
