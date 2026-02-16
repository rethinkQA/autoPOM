# UI Contract — Common Testable Surface

> Extracted from [REQUIREMENTS.md](../docs/REQUIREMENTS.md) §6.
> This is the standalone reference used when building each app.

---

## Application Theme — "GeneralStore"

All apps implement a fictional **"GeneralStore"** mini storefront. The theme is cosmetic — the `data-testid` contract is what matters.

| Page | Content | Notes |
|------|---------|-------|
| **Home** | Product catalog — data table, search/filter, category dropdown, quantity stepper, "Add to Cart" button, shipping options, delivery date picker | All interactive elements live here |
| **About** | Store description — a short paragraph about GeneralStore | Must include `data-testid="about-text"` |

> The store theme should feel like a static prototype, not a working e-commerce app. No cart state persistence, no checkout flow, no real pricing logic. If an element needs to "do something" (e.g., Add to Cart), it displays a toast notification or updates an output display — nothing more.

### Canonical Product Data

All 8 apps **must** use this exact dataset:

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

| Element | Requirement | Test Data Attribute |
|---------|-------------|---------------------|
| Header | Visible heading with store name and technology identifier | `data-testid="app-header"` |
| Navigation | At least 2 links/buttons that switch views/pages (Home, About) | `data-testid="nav-home"`, `data-testid="nav-about"` |
| Main content area | Container that changes based on current view | `data-testid="main-content"` |
| About content | Store description paragraph, visible on the About page | `data-testid="about-text"` |
| Footer | Static footer with text | `data-testid="app-footer"` |

---

## Interactive Elements

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
| Date picker | Native `<input type="date">`, selection reflected in UI | Delivery date selection | `data-testid="date-picker"` |
| Date output | Displays the formatted selected date | Chosen delivery date (e.g., "February 20, 2026") | `data-testid="date-output"` |
| Quantity stepper | Numeric input with increment/decrement controls (+/−) | Product quantity selector | `data-testid="quantity-input"` |
| Quantity increment | The "+" button of the quantity stepper | Increases quantity by 1 (disabled at 99) | `data-testid="quantity-increment"` |
| Quantity decrement | The "−" button of the quantity stepper | Decreases quantity by 1 (disabled at 1) | `data-testid="quantity-decrement"` |
| Modal trigger | Button or link that opens the modal dialog | "View Details" link/button on a product row | `data-testid="modal-trigger"` |
| Modal / Dialog | Overlay that opens and closes, contains content | Product detail or order confirmation dialog | `data-testid="modal-dialog"` |
| Modal close | Button that closes the modal dialog | Close button inside the modal | `data-testid="modal-close"` |
| Toast / Notification | Temporary message that auto-dismisses after a timeout | "Added to cart" feedback — **must** be triggered by `action-button` click (auto-dismiss after 3s) | `data-testid="toast-notification"` |

---

## Dynamic Behaviors

| Behavior | Requirement | Details |
|----------|-------------|---------|
| Conditional rendering | An element that appears/disappears based on interaction | Toggled by checkbox (e.g., filtering in-stock products) |
| List rendering | A static or dynamically generated list of 3+ items | `data-testid="item-list"` |
| Delayed content | Content that appears after a simulated delay (setTimeout, not a real API) | 1–2 second delay, `data-testid="delayed-content"` (e.g., "Loading recommendations…") |
| Form validation | Inline validation message on empty submit | `data-testid="validation-message"` (e.g., "Please enter a search term") |
| Routing / View switching | Navigation changes visible content without full page reload (where applicable) | URL or hash changes for SPA apps |
| Table sorting | Clicking a column header sorts the data table by that column | `data-testid="table-sort"` on sortable column headers; toggles ascending/descending |
| Table filtering | Typing in the text input filters table rows in real time | `data-testid="table-filter"` is the **container element** (e.g., `<div>`) wrapping the filter controls. `data-testid="text-input"` is the `<input>` inside it. |
| Empty results | When all filters combined produce zero matching rows, the table body shows a single row spanning all columns with text "No products found." | `data-testid="empty-state"` on the empty-state row or message element |
| Date selection | Selecting a date in the date picker displays the chosen date in a visible output | Formatted date (e.g., "February 20, 2026") shown in `data-testid="date-output"` |
| Radio selection | Choosing a radio option updates a visible cost/label | e.g., selecting "Express" shows "$9.99" in `data-testid="radio-output"` |
| Modal lifecycle | `data-testid="modal-trigger"` opens the modal; `data-testid="modal-close"` or overlay click dismisses it | Modal must trap focus while open; uses `<dialog>` element where possible |
| Toast auto-dismiss | Toast appears on `action-button` click, then auto-dismisses after ~3 seconds | Must be visible long enough for assertion; uses `aria-live="polite"` |

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

| Placement | Elements | Rationale |
|-----------|----------|----------|
| **Host element (light DOM)** | `app-header`, `nav-home`, `nav-about`, `about-text`, `main-content`, `app-footer` | Same top-level selectors work across all apps |
| **Inside shadow root** | `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `radio-output`, `data-table`, `table-sort`, `table-filter`, `empty-state`, `date-picker`, `date-output`, `quantity-input`, `quantity-increment`, `quantity-decrement`, `modal-trigger`, `modal-dialog`, `modal-close`, `toast-notification`, `item-list`, `delayed-content`, `validation-message` | Forces shadow DOM piercing |

---

## Interaction Specifications

| Interaction | Specification |
|-------------|---------------|
| **Filter composition** | Text input, category dropdown, and in-stock checkbox filters are AND-ed. A product must match all active filters to appear. |
| **Text input filter scope** | Filters against the product **Name** column only (case-insensitive, substring match). |
| **Default sort order** | Table rows are unsorted (insertion order) on initial load. |
| **Sort toggle behavior** | First click → ascending. Second click → descending. Third click → back to ascending. No neutral/unsorted toggle. |
| **Empty results** | When filters produce zero matching rows, show a single row spanning all columns: "No products found." (`data-testid="empty-state"`) |
| **Quantity stepper bounds** | Min: `1`, Max: `99`. `−` disabled at 1; `+` disabled at 99. Default: `1`. |

---

## Complete `data-testid` Reference

Quick-reference list of every required test ID:

### Page Structure
- `app-header` — Header with store name
- `nav-home` — Home navigation link
- `nav-about` — About navigation link
- `main-content` — Main content container
- `about-text` — About page text
- `app-footer` — Footer

### Interactive Elements
- `text-input` — Search/filter text field
- `action-button` — "Add to Cart" button
- `action-output` — Action confirmation message
- `toggle-checkbox` — "In stock only" checkbox
- `select-dropdown` — Category dropdown
- `radio-group` — Shipping method radios
- `radio-output` — Selected shipping cost display
- `data-table` — Product catalog table
- `table-sort` — Sortable column headers
- `table-filter` — Filter controls container
- `empty-state` — "No products found" message
- `date-picker` — Delivery date input
- `date-output` — Selected date display
- `quantity-input` — Quantity number input
- `quantity-increment` — "+" button
- `quantity-decrement` — "−" button
- `modal-trigger` — Opens the modal
- `modal-dialog` — The modal/dialog overlay
- `modal-close` — Closes the modal
- `toast-notification` — Auto-dismissing toast

### Dynamic Content
- `item-list` — Rendered list (3+ items)
- `delayed-content` — Content after simulated delay
- `validation-message` — Form validation error
