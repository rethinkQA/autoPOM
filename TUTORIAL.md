# @playwright-elements/core — Tutorial

A technical walkthrough for adopting `@playwright-elements/core` with any web application.
This guide uses the bundled GeneralStore demo apps as the application under test but
the patterns apply to any Playwright-compatible web app.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Choose and Start an App](#2-choose-and-start-an-app)
3. [Project Setup](#3-project-setup)
4. [Your First Test — Label-Based Interaction](#4-your-first-test--label-based-interaction)
5. [Page Object Construction](#5-page-object-construction)
6. [By Locator Strategies](#6-by-locator-strategies)
7. [Typed Element Wrappers](#7-typed-element-wrappers)
8. [Table Interactions](#8-table-interactions)
9. [Dialog and Toast](#9-dialog-and-toast)
10. [Batch Operations — writeAll / readAll](#10-batch-operations--writeall--readall)
11. [Handler Overrides and Extension](#11-handler-overrides-and-extension)
12. [Middleware](#12-middleware)
13. [Context Isolation](#13-context-isolation)
14. [Adapters — Cross-Library Compatibility](#14-adapters--cross-library-compatibility)
15. [The Crawler Tool](#15-the-crawler-tool)

---

## 1. Prerequisites

| Dependency | Version |
|---|---|
| Node.js | >= 20 |
| npm | >= 10 (ships with Node 20+) |
| Playwright | >= 1.58.0, < 2.0.0 |

Install Playwright browsers if you have not already:

```bash
npx playwright install
```

---

## 2. Choose and Start an App

The repository ships seven demo apps. Pick any one as the application under test.

| App | Port | Start Command | Component Library |
|---|---|---|---|
| vanilla-html | 3001 | `npm start --prefix apps/vanilla-html` | Native HTML |
| react | 3002 | `npm start --prefix apps/react-app` | MUI |
| vue | 3003 | `npm start --prefix apps/vue-app` | Vuetify |
| angular | 3004 | `npm start --prefix apps/angular-app` | Angular Material |
| svelte | 3005 | `npm start --prefix apps/svelte-app` | Bits UI / Flatpickr |
| nextjs | 3006 | `npm start --prefix apps/nextjs-app` | MUI |
| lit | 3007 | `npm start --prefix apps/lit-app` | Shoelace (Shadow DOM) |

Install dependencies for your chosen app first, then start it:

```bash
# Example: using the vanilla-html app
npm install --prefix apps/vanilla-html
npm start --prefix apps/vanilla-html
```

Or start all apps at once:

```bash
npm run install:all
npm run start:all
```

Verify the app is running by opening `http://localhost:<port>` in a browser.

---

## 3. Project Setup

Create a test directory and install dependencies.

```bash
mkdir my-tests && cd my-tests
npm init -y
npm pkg set type=module
npm install -D @playwright/test @playwright-elements/core typescript
npx playwright install chromium
```

> **Note:** `type=module` is required. The framework is ESM-only — without it,
> Node.js defaults to CommonJS semantics and package exports will not resolve.

Create a minimal `playwright.config.ts`:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://localhost:3001",  // adjust port for your chosen app
    headless: true,
  },
});
```

Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  },
  "include": ["tests/**/*.ts"]
}
```

Create the test directory:

```bash
mkdir tests
```

---

## 4. Your First Test — Label-Based Interaction

The core idea: interact with elements using their visible labels, not CSS selectors.

Create `tests/first.spec.ts`:

```ts
import { test, expect } from "@playwright-elements/core/test-fixture";
import { group, By } from "@playwright-elements/core";

test("search filters the product table", async ({ page }) => {
  await page.goto("/");

  // Create a group scoped to the page body
  const root = group(By.css("body"), page);

  // Write to the search input by its label
  await root.write("Search Products", "mouse");

  // Read the value back
  const value = await root.read("Search Products");
  expect(value).toBe("mouse");
});
```

Run it:

```bash
npx playwright test
```

**What happened:** `group.write("Search Products", "mouse")` resolved the label
"Search Products" to the associated `<input>` element, detected its type as a text input
via the handler registry, and called `fill("mouse")` on it. No selectors needed.

---

## 5. Page Object Construction

Page objects in this framework are plain functions that return an object of
scoped groups and typed wrappers.

Create `tests/pages/home.ts`:

```ts
import type { Page } from "@playwright/test";
import {
  group, table, radio, stepper, button, text, toast, dialog,
  By,
} from "@playwright-elements/core";

export function homePage(page: Page) {
  const root = group(By.css("body"), page);

  return {
    // Spread root group — enables page-level write/read/click
    ...root,

    // Scoped containers (label lookup narrowed to this DOM subtree)
    filters: group(By.css(".filter-bar"), page),

    // Typed wrappers — specific APIs per element type
    productTable: table(By.role("table"), page),
    shipping:     radio(By.role("group", { name: "Shipping Method" }), page),
    quantity:     stepper(By.css(".stepper"), page),
    addToCart:    button(By.css(".action-area button"), page),

    // Read-only outputs
    actionOutput: text(By.css(".action-output"), page),

    // Overlay elements
    modal: dialog(By.role("dialog"), page),
    toast: toast(By.css(".toast[aria-live='polite']"), page),
  };
}
```

Use it in a test:

```ts
import { test, expect } from "@playwright-elements/core/test-fixture";
import { homePage } from "./pages/home.js";

test("filter products by category", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  await home.filters.write("Category", "Electronics");
  expect(await home.filters.read("Category")).toBe("Electronics");

  // Table should reflect the filter
  const rowCount = await home.productTable.rowCount();
  expect(rowCount).toBe(3);
});
```

### Key Concepts

- **`...root` spread** — Exposes `write`, `read`, `writeAll`, `readAll`, `click` at the
  page level. Useful when a label is globally unique.
- **Scoped groups** — `filters: group(By.css(".filter-bar"), page)` limits label resolution
  to the `.filter-bar` subtree. Use scoping to resolve ambiguous labels.
- **Typed wrappers** — `table()`, `radio()`, `stepper()`, etc. provide domain-specific
  methods (`sort()`, `choose()`, `increment()`) beyond generic `write`/`read`.

---

## 6. By Locator Strategies

The `By` class provides multiple strategies for locating elements.

```ts
import { By } from "@playwright-elements/core";

// By label — matches <label> associations, aria-label, etc.
By.label("Search Products")

// By ARIA role — matches role attribute with optional accessible name
By.role("button", { name: "Add to Cart" })

// By CSS selector — escape hatch for explicit selectors
By.css(".filter-bar")

// By visible text — string or regex
By.text("Add to Cart")
By.text(/add to cart/i)

// By scoped child — resolve child within parent
By.within(By.css(".filter-bar"), By.label("Category"))

// By fallback chain — first match in DOM order
By.any(By.css("#search-input"), By.label("Search Products"))

// By priority — strict order, first resolvable wins
By.first(By.label("Search"), By.css("input[type='search']"))

// By shadow DOM — pierce shadow boundaries
By.shadow(By.css("sl-input"), By.css("input"))
```

### Resolving a By to a Playwright Locator

Every `By` instance resolves asynchronously:

```ts
const locator = await By.label("Search Products").resolve(page);
await locator.fill("direct access");
```

This is useful when you need to drop down to raw Playwright for a one-off
assertion or interaction.

---

## 7. Typed Element Wrappers

Each wrapper provides a focused API for its element type.

### checkbox

```ts
import { checkbox, By } from "@playwright-elements/core";

const inStock = checkbox(By.label("Show only in-stock items"), page);
await inStock.check(true);
expect(await inStock.isChecked()).toBe(true);
await inStock.check(false);
```

### select

```ts
import { select, By } from "@playwright-elements/core";

const category = select(By.label("Category"), page);
await category.choose("Electronics");
expect(await category.read()).toBe("Electronics");
const options = await category.options();
// ["All", "Electronics", "Books", "Clothing"]
```

### radio

```ts
import { radio, By } from "@playwright-elements/core";

const shipping = radio(By.role("group", { name: "Shipping Method" }), page);
await shipping.choose("Express");
expect(await shipping.read()).toBe("Express");
const opts = await shipping.options();
// ["Standard", "Express", "Overnight"]
```

### stepper

```ts
import { stepper, By } from "@playwright-elements/core";

const qty = stepper(By.css(".stepper"), page);
await qty.set(3);
expect(await qty.read()).toBe("3");
await qty.increment();
expect(await qty.read()).toBe("4");
await qty.decrement();
expect(await qty.isMinDisabled()).toBe(false);
```

### textInput

```ts
import { textInput, By } from "@playwright-elements/core";

const search = textInput(By.label("Search Products"), page);
await search.write("keyboard");
expect(await search.read()).toBe("keyboard");
await search.clear();
```

### button

```ts
import { button, By } from "@playwright-elements/core";

const addBtn = button(By.css(".action-area button"), page);
await addBtn.click();
```

### text (read-only)

```ts
import { text, By } from "@playwright-elements/core";

const output = text(By.css(".action-output"), page);
const message = await output.read();
```

### Common base methods

All wrappers share:

```ts
await element.waitForVisible();
await element.waitForHidden();
const visible = await element.isVisible();
const disabled = await element.isDisabled();
const loc = await element.locator();       // raw Playwright Locator
const scoped = element.withTimeout(3000);  // override timeout
```

---

## 8. Table Interactions

The `table()` wrapper provides structured access to tabular data.

```ts
import { test, expect } from "@playwright-elements/core/test-fixture";
import { homePage } from "./pages/home.js";

test("read table data", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Column headers
  const headers = await home.productTable.headers();
  expect(headers).toContain("Name");

  // Row count
  expect(await home.productTable.rowCount()).toBe(7);

  // All rows as objects keyed by column name
  const rows = await home.productTable.rows();
  expect(rows[0].Name).toBe("Wireless Mouse");
});

test("sort table by column", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  await home.productTable.sort("Name");
  const rows = await home.productTable.rows();
  expect(rows[0].Name).toBe("Bluetooth Keyboard");
});

test("find and interact with a specific row", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Find row by column criteria
  const row = await home.productTable.findRow({ Name: "Wireless Mouse" });
  expect(await row.get("Price")).toBe("$29.99");
  expect(await row.get("Category")).toBe("Electronics");

  // Click a button within the row
  await row.click("Add to Cart");
});

test("multi-criteria row lookup", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  const row = await home.productTable.findRow({
    Category: "Books",
    Stock: "Yes",
  });
  const name = await row.get("Name");
  expect(["Cooking Basics", "Science Fiction Novel"]).toContain(name);
});

test("empty state", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Filter to no results
  await home.filters.write("Search Products", "xyznonexistent");
  expect(await home.productTable.isEmpty()).toBe(true);
  expect(await home.productTable.emptyText()).toBeTruthy();
});
```

---

## 9. Dialog and Toast

### Dialog

```ts
test("open and close product detail modal", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Click a product name in the table to open the dialog
  const row = await home.productTable.findRow({ Name: "Bluetooth Keyboard" });
  await row.click("Bluetooth Keyboard");

  // Dialog API
  expect(await home.modal.isOpen()).toBe(true);
  expect(await home.modal.title()).toBe("Bluetooth Keyboard");
  const body = await home.modal.body();
  expect(body).toContain("$49.99");

  // Close
  await home.modal.close();
  expect(await home.modal.isOpen()).toBe(false);
});
```

### Toast

```ts
test("add to cart shows toast notification", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  await home.addToCart.click();

  // Wait for toast to appear
  await home.toast.waitForVisible();
  const message = await home.toast.read();
  expect(message).toContain("Added");

  // Wait for auto-dismiss
  await home.toast.waitForHidden({ timeout: 6000 });
});
```

---

## 10. Batch Operations — writeAll / readAll

Fill or read multiple fields in a single call.

```ts
test("batch fill and read the filter bar", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Write multiple fields
  await home.filters.writeAll({
    "Search Products": "mouse",
    "Category": "Electronics",
    "Show only in-stock items": true,
  });

  // Read them back
  const values = await home.filters.readAll([
    "Search Products",
    "Category",
    "Show only in-stock items",
  ]);

  expect(values).toEqual({
    "Search Products": "mouse",
    "Category": "Electronics",
    "Show only in-stock items": true,
  });

  // Table reflects combined filters
  expect(await home.productTable.rowCount()).toBe(1);
});
```

`writeAll` resolves all labels in parallel (for speed), then executes writes
sequentially (for correctness — prior writes may alter the DOM).

---

## 11. Handler Overrides and Extension

### Overriding a handler for a specific label

When auto-detection picks the wrong handler, override it:

```ts
test("override handler for a specific field", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  // Force "Search Products" to use the "input" handler
  const overridden = home.filters.overrideHandler("Search Products", "input");
  await overridden.write("Search Products", "mouse");
  expect(await overridden.read("Search Products")).toBe("mouse");
});
```

`overrideHandler` returns a **new group** — it does not mutate the original.
Always capture the return value.

### Override with a custom handler object

```ts
test("custom handler object", async ({ page }) => {
  await page.goto("/");
  const home = homePage(page);

  const custom = home.filters.overrideHandler("Search Products", {
    async set(el, value) {
      await el.fill(String(value));
      await el.press("Enter");
    },
    async get(el) {
      return await el.inputValue();
    },
  });

  await custom.write("Search Products", "keyboard");
  expect(await custom.read("Search Products")).toBe("keyboard");
});
```

### Registering a global handler

Add a handler to the registry so auto-detection recognizes a new element type:

```ts
import { test } from "@playwright-elements/core/test-fixture";
import { registerHandler } from "@playwright-elements/core/extend";

test("register a custom handler", async ({ page }) => {
  registerHandler({
    type: "numeric-input",
    detect: [{ tags: ["input"], inputTypes: ["number"] }],
    expectedValueType: ["string"],
    valueKind: "string",
    async set(el, value) { await el.fill(String(value)); },
    async get(el) { return await el.inputValue(); },
  }, "first");  // "first" | "last" | { before: "type" } | { after: "type" }

  // Now auto-detection will match <input type="number"> to this handler
  // before falling through to the default "input" handler.
});
```

`registerHandler` positions control detection priority:
- `"first"` — highest priority (checked before all others)
- `"last"` — lowest priority (before the catch-all fallback)
- `{ before: "checkbox" }` — insert before a named handler
- `{ after: "select" }` — insert after a named handler

---

## 12. Middleware

Middleware wraps every element action (write, read, click, etc.) with
cross-cutting behavior.

### Logging middleware

```ts
import { useMiddleware } from "@playwright-elements/core/extend";

useMiddleware(async (ctx, next) => {
  const label = ctx.by ?? ctx.elementType;
  console.log(`→ ${ctx.elementType}.${ctx.action}(${ctx.args.join(", ")})`);
  const start = Date.now();
  const result = await next();
  console.log(`← ${label} [${Date.now() - start}ms]`);
  return result;
}, "first");
```

### Network settle middleware

Wait for pending API requests to complete after each interaction:

```ts
import { networkSettleMiddleware } from "@playwright-elements/core/extend";

useMiddleware(networkSettleMiddleware({ timeout: 3000 }), "last");
```

### ActionContext

The middleware `ctx` argument carries observability data:

| Property | Type | Description |
|---|---|---|
| `elementType` | `string` | `"button"`, `"group"`, `"table"`, etc. |
| `action` | `string` | `"write"`, `"read"`, `"click"`, `"sort"`, etc. |
| `args` | `readonly unknown[]` | Arguments passed to the action |
| `by` | `string \| undefined` | The `By` descriptor, e.g. `'By.label("Email")'` |
| `locator()` | `() => Promise<Locator>` | Async Playwright locator provider |
| `page()` | `() => Promise<Page>` | Async Page provider |
| `timeout` | `number \| undefined` | Effective timeout for this action |
| `startTime` | `number` | `Date.now()` at invocation |

---

## 13. Context Isolation

The test fixture from `@playwright-elements/core/test-fixture` provides
automatic per-test isolation. Each test gets a fresh `FrameworkContext` —
handler registrations, middleware, and logger configuration are scoped
to that test and discarded afterward.

```ts
import { test, expect } from "@playwright-elements/core/test-fixture";
import { registerHandler } from "@playwright-elements/core/extend";

test("test A registers a handler", async ({ page }) => {
  registerHandler(myHandler, "first");
  // myHandler is active only within this test
});

test("test B is unaffected", async ({ page }) => {
  // myHandler is NOT registered here — clean context
});
```

This works with `fullyParallel: true` — multiple tests running in the
same Node.js worker process cannot interfere with each other because
the context is stored in `AsyncLocalStorage`.

### Manual context management

Outside the test fixture (e.g., standalone scripts), create and scope
contexts manually:

```ts
import { createFrameworkContext, runWithContext } from "@playwright-elements/core";

const ctx = createFrameworkContext();
await runWithContext(ctx, async () => {
  // All framework calls inside this callback use `ctx`
});
```

---

## 14. Adapters — Cross-Library Compatibility

Component libraries render the same UI concept differently. Adapters
encapsulate those differences so test code stays uniform.

### Date picker adapters

```ts
import {
  nativeDatePickerAdapter,    // <input type="date">
  reactDatePickerAdapter,     // react-datepicker
  vueDatePickerAdapter,       // @vuepic/vue-datepicker
  matDatePickerAdapter,       // Angular Material datepicker
  flatpickrAdapter,           // Flatpickr
} from "@playwright-elements/core";
import { datePicker, By } from "@playwright-elements/core";

// Inject the adapter matching your component library
const date = datePicker(By.label("Choose a date"), page, {
  adapter: reactDatePickerAdapter,
});

await date.select("2026-02-20");
expect(await date.read()).toContain("2026");
```

### App-aware adapter configuration

A common pattern — map project names to adapter options:

```ts
// tests/pages/app-config.ts
import type { TestInfo } from "@playwright/test";
import {
  reactDatePickerAdapter,
  vueDatePickerAdapter,
  matDatePickerAdapter,
  flatpickrAdapter,
  nativeDatePickerAdapter,
} from "@playwright-elements/core";

const adapterMap: Record<string, { datePickerAdapter?: any }> = {
  vanilla: {},
  react:   { datePickerAdapter: reactDatePickerAdapter },
  vue:     { datePickerAdapter: vueDatePickerAdapter },
  angular: { datePickerAdapter: matDatePickerAdapter },
  svelte:  { datePickerAdapter: flatpickrAdapter },
  nextjs:  { datePickerAdapter: reactDatePickerAdapter },
  lit:     { datePickerAdapter: nativeDatePickerAdapter },
};

export function appConfig(testInfo: TestInfo) {
  return adapterMap[testInfo.project.name] ?? {};
}
```

Usage:

```ts
import { appConfig } from "./pages/app-config.js";
import { homePage } from "./pages/home.js";

test("select a delivery date", async ({ page }, testInfo) => {
  await page.goto("/");
  const home = homePage(page, appConfig(testInfo));
  await home.deliveryDate.select("2026-02-20");
});
```

### Select adapters

For non-native dropdowns (MUI Select, Vuetify v-select, Shoelace sl-select):

```ts
import {
  genericNonEditableSelectAdapter,
  editableSelectAdapter,
} from "@playwright-elements/core";
```

### Table adapters

For table markup that deviates from standard `<table>`:

```ts
import { defaultTableAdapter, table, By } from "@playwright-elements/core";

const customTable = table(By.css(".data-grid"), page, {
  adapter: {
    ...defaultTableAdapter,
    headerCells: ".grid-header .cell",
    dataRows: ".grid-body .row",
    cells: ".cell",
  },
});
```

---

## 15. The Crawler Tool

The `@playwright-elements/crawler` tool discovers page structure at runtime and
generates page object scaffolds. It is useful for bootstrapping tests on new
pages or detecting UI drift in CI.

### Installation

The crawler is included in the monorepo workspace. From the repo root:

```bash
cd tools/crawler
npm install
npm run build
```

### Crawl a Page

Point the crawler at a running app:

```bash
npx pw-crawl http://localhost:3001 -o manifests/vanilla.json
```

This produces a **manifest** — a JSON snapshot of the page's group structure:

```json
{
  "url": "http://localhost:3001/",
  "timestamp": "2026-03-24T12:00:00.000Z",
  "scope": null,
  "passCount": 1,
  "groups": [
    {
      "label": "GeneralStore Vanilla HTML",
      "selector": "header",
      "groupType": "header",
      "wrapperType": "group",
      "discoveredIn": "pass-1",
      "visibility": "static",
      "lastSeen": "2026-03-24T12:00:00.000Z"
    },
    {
      "label": "Home",
      "selector": "nav",
      "groupType": "nav",
      "wrapperType": "group",
      "discoveredIn": "pass-1",
      "visibility": "static",
      "lastSeen": "2026-03-24T12:00:00.000Z"
    },
    {
      "label": "data-table",
      "selector": "table.data-table",
      "groupType": "generic",
      "wrapperType": "table",
      "discoveredIn": "pass-1",
      "visibility": "static",
      "lastSeen": "2026-03-24T12:00:00.000Z"
    }
  ]
}
```

### CLI Options

```bash
# Write manifest to file
npx pw-crawl <url> -o manifest.json

# Limit discovery to a CSS scope
npx pw-crawl <url> --scope ".main-content"

# Multi-pass merge (e.g., after opening a dialog manually)
npx pw-crawl <url> -o manifest.json --pass 2

# Capture API dependencies
npx pw-crawl <url> --observe-network -o manifest.json

# Headed mode (visible browser)
npx pw-crawl <url> --headed

# Diff against existing manifest (CI drift detection)
npx pw-crawl <url> --diff manifest.json
# Exit 0 = no drift, Exit 1 = drift detected
```

### Multi-Pass Crawling

Dynamic elements (dialogs, toasts, lazy-loaded sections) are not visible on
initial page load. Use multi-pass crawling to capture them:

```bash
# Pass 1: default page state
npx pw-crawl http://localhost:3001 -o manifest.json

# Open the dialog manually in the browser, then:
# Pass 2: re-crawl with the dialog visible
npx pw-crawl http://localhost:3001 -o manifest.json --pass 2
```

The manifest merges incrementally — new groups are appended, existing groups are
updated, groups not found in the current DOM are retained.

### Record Mode

Record mode automates multi-pass crawling with a `MutationObserver`:

```bash
npx pw-crawl record http://localhost:3001 -o manifest.json
```

This opens a headed browser. Interact with the page (click buttons, open menus,
trigger toasts). When done, press `Ctrl+C` to harvest. New groups are tagged
with `visibility: "exploration"` and `triggeredBy` metadata.

### Generate Page Objects

Convert a manifest into a TypeScript page object scaffold:

```bash
# Single route
npx pw-crawl generate manifest.json -o tests/pages/

# Multiple routes
npx pw-crawl generate home.json about.json -o tests/pages/

# CI check — exit 1 if generated output differs from existing files
npx pw-crawl generate manifest.json --check tests/pages/
```

Example generated output:

```ts
// @generated by pw-crawl — do not edit manually
import type { Page } from "@playwright/test";
import { group, table, dialog, toast, By } from "@playwright-elements/core";

export function homePage(page: Page) {
  const root = group(By.css("body"), page);

  return {
    // ── Landmarks ───────────────────────────────
    nav:    group(By.role("navigation"), page),
    header: group(By.css("header"), page),

    // ── Scoped containers ───────────────────────
    shippingMethod: group(By.role("group", { name: "Shipping Method" }), page),
    quantity:       group(By.role("group", { name: "Quantity" }), page),

    // ── Typed wrappers ──────────────────────────
    productTable:    table(By.role("table"), page),
    productDetails:  dialog(By.css("#product-modal"), page),
    toastNotification: toast(By.css("#toast-notification"), page),
  };
}
```

This scaffold is a starting point. Refine it by:
- Replacing generic `group()` wrappers with typed wrappers (`radio()`, `stepper()`, etc.)
- Adding adapter options for component-library-specific elements
- Spreading `...root` for page-level label access

### Drift Detection in CI

Use `--diff` to compare the live DOM against a committed manifest:

```bash
npx pw-crawl http://localhost:3001 --diff manifests/vanilla.json
```

Exit code 0 means no structural changes. Exit code 1 prints a diff of added,
removed, and changed groups — useful for catching unintended UI regressions.

### Crawler Workflow Summary

```
  ┌────────────┐     ┌──────────────┐     ┌──────────────────┐
  │  crawl     │────▶│  manifest    │────▶│  generate        │
  │  (or       │     │  .json       │     │  page objects     │
  │   record)  │     │              │     │  .ts              │
  └────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                            │  CI
                            ▼
                     ┌──────────────┐
                     │  --diff      │
                     │  drift check │
                     └──────────────┘
```

---

## Error Types

The framework provides structured errors with diagnostic context:

| Error | When | Useful Properties |
|---|---|---|
| `ElementNotFoundError` | Label could not be resolved | `query`, `triedStrategies` |
| `AmbiguousMatchError` | Multiple elements matched | `query`, `matchCount` |
| `ColumnNotFoundError` | Table column not found | `column`, `availableColumns` |
| `NoHandlerMatchError` | No handler matched the element | `tag`, `role` |

```ts
import { ElementNotFoundError } from "@playwright-elements/core";

try {
  await home.filters.write("Nonexistent Field", "value");
} catch (e) {
  if (e instanceof ElementNotFoundError) {
    console.log(e.query);            // "Nonexistent Field"
    console.log(e.triedStrategies);  // ["getByLabel", "getByRole(...)"]
  }
}
```

---

## Quick Reference

### Imports

```ts
// Core API — element factories, By strategies, adapters, errors
import { ... } from "@playwright-elements/core";

// Test fixture — per-test context isolation
import { test, expect } from "@playwright-elements/core/test-fixture";

// Extension API — handler registration, middleware, DOM helpers
import { ... } from "@playwright-elements/core/extend";
```

### Element Factory Summary

| Factory | Primary Methods |
|---|---|
| `group(by, page)` | `write`, `read`, `writeAll`, `readAll`, `find`, `click`, `overrideHandler` |
| `table(by, page)` | `headers`, `rows`, `rowCount`, `sort`, `findRow`, `isEmpty`, `emptyText` |
| `checkbox(by, page)` | `check`, `isChecked`, `read` |
| `select(by, page)` | `choose`, `read`, `options` |
| `radio(by, page)` | `choose`, `read`, `options` |
| `textInput(by, page)` | `write`, `read`, `clear` |
| `button(by, page)` | `click`, `read` |
| `stepper(by, page)` | `set`, `read`, `increment`, `decrement`, `isMinDisabled`, `isMaxDisabled` |
| `datePicker(by, page, opts)` | `select`, `read` |
| `dialog(by, page)` | `isOpen`, `close`, `title`, `body` |
| `toast(by, page)` | `read`, `waitForVisible`, `waitForHidden` |
| `text(by, page)` | `read` |

### By Strategy Summary

| Strategy | Example |
|---|---|
| `By.label(text)` | `By.label("Email")` |
| `By.role(role, opts?)` | `By.role("button", { name: "Submit" })` |
| `By.css(selector)` | `By.css(".filter-bar")` |
| `By.text(text \| regex)` | `By.text(/add to cart/i)` |
| `By.within(parent, child)` | `By.within(By.css("nav"), By.text("Home"))` |
| `By.any(...bys)` | `By.any(By.css("#id"), By.label("Name"))` |
| `By.first(...bys)` | `By.first(By.label("Name"), By.css("input"))` |
| `By.shadow(host, inner)` | `By.shadow(By.css("sl-input"), By.css("input"))` |
