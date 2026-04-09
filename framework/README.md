# @playwright-elements/core

> Label-first element identification and interaction for Playwright tests. Auto-detects element types, provides `write(label, value)` / `read(label)` for standard form controls, and typed wrappers for elements with rich behaviour.

## Install

```bash
npm install @playwright-elements/core
```

## Quick Start

```ts
import { test } from "@playwright-elements/core/test-fixture";
import { By, group, table } from "@playwright-elements/core";

test("fill a form by label", async ({ page }) => {
  const home = group(By.css("body"), page);

  await home.write("Category", "Electronics");
  await home.write("Show only in-stock items", true);

  expect(await home.read("Category")).toBe("Electronics");
});
```

### Running the validation suite

The repo ships 7 test-fixture apps (vanilla HTML, React + MUI, Vue + Vuetify, Angular + Angular Material, Svelte + Bits UI, Next.js + MUI, Lit + Shoelace) and 1376 tests.

```bash
npm install
npx playwright test                       # all 7 apps (1064 integration tests)
npx playwright test --project=vanilla     # single app
npx playwright test --config=playwright.unit.config.ts   # 312 unit tests
```

Playwright auto-starts each app's dev server via the multi-project `webServer` config.

---

## Getting Started with Your App

Point the framework at your own app in three steps:

**1. Install**

```bash
npm install @playwright-elements/core @playwright/test
```

**2. Configure `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

**3. Write your first test**

```ts
// tests/my-app.spec.ts
import { test, expect } from "@playwright-elements/core/test-fixture";
import { By, group } from "@playwright-elements/core";

test("fill and read a form by label", async ({ page }) => {
  await page.goto("/");
  const app = group(By.css("body"), page);

  await app.write("Email", "user@example.com");
  expect(await app.read("Email")).toBe("user@example.com");
});
```

Run with `npx playwright test`. The framework auto-detects element types (text input, select, checkbox, radio, etc.) from the DOM — no selectors needed beyond labels.

---

## Core Concepts

### 1. `By` — Element Identification

`By` is a data object that describes *how* to locate an element. It resolves to a Playwright `Locator` against any scope (Page or Locator).

```ts
By.label("Show only in-stock items")    // <label> association
By.role("button", { name: "Add" })     // ARIA role + accessible name
By.css(".filter-bar")                  // CSS selector
By.text("Add to Cart")                 // visible text
By.shadow("host-el", "button")         // shadow DOM piercing
By.within(parent, child)               // scoped lookup
By.any(by1, by2)                       // union match — first DOM-order match
By.first(by1, by2)                     // priority fallback — composable By
```

### 2. `group` — Label-First Interaction

The `group` element is the primary interaction pattern. It finds elements by their label and auto-detects the type (checkbox, select, radio group, text input, etc.) via the handler registry.

```ts
const home = group(By.css("body"), page);

await home.write("Show only in-stock items", true);   // checkbox → check()
await home.write("Category", "Electronics");           // select → selectOption()
await home.write("Shipping Method", "Express");        // radiogroup → check by label
await home.write("Search", "wireless");          // text input → fill()

const val = await home.read("Category");        // → "Electronics"
```

**Batch operations:**
```ts
await home.writeAll({ "In stock only": true, "Category": "Electronics" });
const values = await home.readAll(["In stock only", "Category"]);
```

**Scoping and clicking:**
```ts
await home.click("Add to Cart");                          // button/link by text
const row = await home.find(By.css("td"), "Wireless Mouse");   // narrow to container (async, exact match)
```

### 3. Handler Registry — Auto-Detection

The handler registry (`handler-registry.ts` for the registry class, `default-handlers.ts` for the 12 built-in handlers) is the single source of truth for what elements exist and how to interact with them. Each handler declares:

- **`detect: DetectRule[]`** — serialisable rules (tags, roles, inputTypes, requireChild, attr)
- **`set(el, value)`** / **`get(el)`** — Playwright interaction methods

Detection runs in a single `evaluate()` round-trip. Handlers in priority order:

| Type | Detects | set | get |
|------|---------|-----|-----|
| `checkbox` | `<input type="checkbox">` | check/uncheck | boolean |
| `radio` | `<input type="radio">` | check | boolean |
| `slider` | `<input type="range">`, `role="slider"` | fill | string |
| `select` | `<select>`, `role="listbox"` | selectOption | option text |
| `textarea` | `<textarea>` | fill | string |
| `switch` | `role="switch"` | check/uncheck | boolean |
| `combobox` | `role="combobox"` | fill + option click | string |
| `radiogroup` | `<fieldset>`/`role="radiogroup"`/`role="group"` with radio children | label + check | checked label |
| `checkboxgroup` | `<fieldset>`/`role="group"` with checkbox children | check/uncheck per label | comma labels |
| `button` | `<button>`, `role="button"` | click | text content |
| `link` | `<a>`, `role="link"` | click | text content |
| `input` | `role="textbox"`/`role="spinbutton"`/`role="searchbox"`, `contenteditable`, `<input>` (fallback) | fill | string |

**To add a new element type:** Use `registerHandler()` from the extension API (`@playwright-elements/core/extend`). Everything else (`detectHandler`, `resolveLabeled`, `getRoleFallbacks`) adapts automatically.

### 4. Typed Wrappers — Rich Behaviour

Use typed wrappers for elements that need operations beyond write/read:

```ts
const tbl = table(By.css("table"), page);
await tbl.sort("Price");
const rows = await tbl.rows();              // → [{ Name: "...", Price: "..." }, ...]

const qty = stepper(By.role("spinbutton"), page);
await qty.increment();
await qty.decrement();

const dlg = dialog(By.css("dialog"), page);
await dlg.isOpen();    // → boolean
await dlg.close();

const t = toast(By.css(".toast"), page);
await t.read();          // → "Added Wireless Mouse"
await t.waitForDismiss();
```

Available wrappers: `checkbox`, `select`, `button`, `text`, `textInput`, `table`, `stepper`, `datePicker`, `radio`, `dialog`, `toast`, `group`.

### 5. Page Compositions

Pages are composed as functions: a **root group spread** for label-first access, plus typed wrappers for rich behaviour.

```ts
import { By, group, table, stepper, dialog, toast } from "../src/index.js";

function homePage(page: Page) {
  const root = group(By.css("body"), page);
  return {
    ...root,                                              // write/read/writeAll/readAll/click
    filters:      group(By.css(".filter-bar"), page),     // scoped container
    productTable: table(By.css("table"), page),            // rich: sort, rows
    quantity:     stepper(By.role("spinbutton"), page),   // rich: increment/decrement
    modal:        dialog(By.css("dialog"), page),          // rich: isOpen, close
    toast:        toast(By.css(".toast"), page),
  };
}
```

---

## Resolution Chain

When `group.write(label, value)` or `group.read(label)` is called, `resolveLabeled` finds the element:

1. **Phase 1:** `container.getByLabel(label)` — matches standard `<label>` associations.
2. **Phase 2:** Iterate `roleFallbacks` — tries `container.getByRole(role, { name: label })` for each role derived from handler detect rules. Catches `<fieldset>/<legend>`, ARIA widgets, etc.

Once found, `detectHandler(el)` classifies the DOM node in one `evaluate()` call and delegates to the matched handler's `set()` or `get()` (internal handler API).

---

## Advanced Features

### 6. Middleware Pipeline

All element actions (write, read, click, etc.) pass through a middleware pipeline. Middleware can add logging, retries, timing, or custom behaviour.

```ts
import { useMiddleware } from "@playwright-elements/core/extend";

const timingMiddleware: Middleware = async (context, next) => {
  const start = Date.now();
  const result = await next();
  console.log(`${context.action} took ${Date.now() - start}ms`);
  return result;
};

useMiddleware(timingMiddleware);                    // append to pipeline
useMiddleware(timingMiddleware, "first");           // prepend
useMiddleware(timingMiddleware, { before: other }); // positional insert
```

Key design details:
- **Nested-action guard:** Inner actions (e.g. a `write` that triggers a `click` internally) skip middleware to prevent double logging/retries. Uses `AsyncLocalStorage` so concurrent `Promise.all` actions each get their own scope.
- **`forceMiddleware: true`:** Escape hatch on `ActionContext` to force middleware even for nested actions (useful for cross-element coordination).
- **`context.page`:** `ActionContext` exposes a `page?: () => Promise<Page>` provider, auto-derived from the element's locator. Middleware can use it to access page-level APIs (e.g. network events).

> **When to use `forceMiddleware`:** The nested-action guard is per-async-chain, not per-element. If a middleware-wrapped action on element A triggers an action on element B (e.g. clicking a button then reading a toast), B's action will also skip middleware because it's in the same async chain. To ensure middleware fires on B, create the element with `forceMiddleware: true` in the `WrapElementMeta`:
>
> ```ts
> const t = toast(By.css(".toast"), page, { forceMiddleware: true });
> await t.read(); // middleware fires even if called from within another action
> ```

#### Built-in: `networkSettleMiddleware`

A middleware factory that waits for in-flight HTTP requests to settle after write/click actions. Eliminates manual `page.waitForResponse()` calls after interactions that trigger API calls (e.g. selecting a dropdown that fetches data, clicking a button that POSTs a form).

```ts
import { useMiddleware } from "@playwright-elements/core/extend";
import { networkSettleMiddleware } from "@playwright-elements/core/extend";

// Basic — wait for network after every write/click/writeAll
useMiddleware(networkSettleMiddleware());

// With options
useMiddleware(networkSettleMiddleware({
  idleTime: 500,        // ms with 0 pending requests before "settled" (default: 300)
  timeout: 10_000,      // max wait time — warns, doesn't throw (default: 10s)
  actions: ["write", "click"],  // which actions trigger waiting (default: write/click/writeAll)
  ignore: [/analytics/, /tracking/],  // URL patterns to exclude from tracking
  onRequest: (url) => console.log("→", url),
  onRequestDone: (url) => console.log("✓", url),
  onTimeout: (pending) => console.warn("Still pending:", pending),
}));
```

How it works:
1. Before the action, hooks `page.on("request")` / `page.on("requestfinished")` / `page.on("requestfailed")`.
2. Executes the action via `next()`.
3. After the action completes, waits until the pending request count reaches 0 and stays at 0 for `idleTime` ms.
4. Cleans up event listeners and returns.

The middleware is action-scoped — it only activates for the configured action types and gracefully skips if no `Page` is available.

### 7. Context Isolation

Each test gets an isolated `FrameworkContext` containing its own handler registry, middleware pipeline, logger, and retry config. No shared mutable state between tests.

```ts
// Use the drop-in test fixture for automatic isolation:
import { test, expect } from "../src/test-fixture.js";

test("my test", async ({ page, ctx }) => {
  // ctx is a fresh FrameworkContext — handlers, middleware, logger are isolated
  // All framework functions automatically use this context
});
```

Powered by `AsyncLocalStorage`:
- `createFrameworkContext()` — creates an isolated context
- `runWithContext(ctx, fn)` — runs a callback scoped to a specific context
- `getActiveContext()` — resolves: (1) ALS scope → (2) fallback → (3) strict-mode throw
- `setStrictContextMode(true)` — (default) throws if framework functions called outside a test scope

### 8. Retry with Discriminated Unions

`retryUntil` uses `RetryResult<T>` — a discriminated union — instead of exception-based control flow:

```ts
import { retryUntil, RetryResult } from "@playwright-elements/core";

const result = await retryUntil(async (): Promise<RetryResult<string>> => {
  const text = await el.textContent();
  if (text === "Loading...") return { ok: false, retryable: true, error: "still loading" };
  if (!text)                  return { ok: false, retryable: false, error: "element gone" };
  return { ok: true, value: text };
}, { timeout: 5000, intervals: [100, 250, 500] });
```

Three possible states:
- `{ ok: true, value: T }` — success, return value
- `{ ok: false, retryable: true, error }` — transient failure, keep retrying
- `{ ok: false, retryable: false, error }` — non-transient failure, throw immediately

### 9. Extension API (`extend.ts`)

Three-tier import strategy for different audiences:

| Import | Audience | Example |
|--------|----------|---------|
| `@playwright-elements/core` | Test authors | `By`, `group`, `table`, `write()`, `read()` |
| `@playwright-elements/core/extend` | Extension authors | `registerHandler`, `createHandler`, `useMiddleware`, `wrapElement` |
| `@playwright-elements/core/internals` | Framework contributors | Low-level APIs, no semver guarantees |

The extension API exposes handler creation helpers (`createHandler`, `getDefaultHandlerByType`), reusable interaction primitives (`toggleSet`, `fillSet`, `fillGet`), middleware management (`useMiddleware`, `removeMiddleware`), and element wrapping (`wrapElement`, `buildElement`, `buildElementFromProvider`).

### 10. Group Advanced Methods

Beyond `write`/`read`/`writeAll`/`readAll`/`click`/`find`, group provides:

- **`readTyped(label, kind)`** — type-safe reading with runtime validation. Accepts `'string'`, `'boolean'`, or `'string[]'`. Throws `TypeError` if the handler's `valueKind` doesn't match.
  ```ts
  const checked = await home.readTyped("In stock only", "boolean"); // boolean
  const category = await home.readTyped("Category", "string");      // string
  ```

- **`overrideHandler(label, handler)`** — immutable builder that overrides the auto-detected handler for a specific label. Returns a new group; the original is unaffected.
  ```ts
  const custom = home.overrideHandler("Quantity", "slider");
  await custom.write("Quantity", "5");  // uses slider handler instead of auto-detect
  ```

- **`withTimeout(ms)`** — available on every element (inherited from `BaseElement`). Returns a new instance with the specified timeout for all operations.
  ```ts
  const slow = home.withTimeout(10_000);
  await slow.write("Category", "Electronics");  // 10s timeout
  ```

---

## Project Structure

```
framework/
├── src/                              (22 files)
│   ├── index.ts                      ← public API exports
│   ├── by.ts                         ← By class (8 locator strategies)
│   ├── context.ts                    ← FrameworkContext, AsyncLocalStorage isolation
│   ├── default-handlers.ts           ← 12 built-in handlers + createDefaultHandlers()
│   ├── defaults.ts                   ← convenience functions bound to active context
│   ├── dom-helpers.ts                ← DOM query helpers
│   ├── element-classifier.ts         ← single-evaluate element classification
│   ├── errors.ts                     ← 4 error classes (see below)
│   ├── extend.ts                     ← extension author API ("@playwright-elements/core/extend")
│   ├── handler-registry.ts           ← HandlerRegistry class (detect, register, role fallbacks)
│   ├── handler-types.ts              ← handler type definitions
│   ├── internals.ts                  ← low-level API ("@playwright-elements/core/internals")
│   ├── label-resolution.ts           ← resolveLabeled (label → element lookup)
│   ├── logger-config.ts              ← LoggerConfig, configureLogger
│   ├── middleware-pipeline.ts         ← MiddlewarePipeline, useMiddleware, nested-action guard
│   ├── middleware-types.ts            ← Middleware, ActionContext, NextFn types
│   ├── playwright-errors.ts           ← Playwright error detection utilities
│   ├── resolve-retry-config.ts        ← configurable retry settings for label resolution
│   ├── retry.ts                      ← retryUntil, RetryResult<T> (discriminated union)
│   ├── test-fixture.ts               ← drop-in test fixture with per-test context isolation
│   ├── types.ts                      ← shared types (Scope, AriaRole, etc.)
│   └── wrap-element.ts               ← wrapElement, buildElement, buildElementFromProvider
│
│   └── elements/                     (21 files)
│       ├── index.ts                  ← element barrel exports
│       ├── base.ts                   ← BaseElement (withTimeout, locator access)
│       ├── button.ts
│       ├── checkbox.ts
│       ├── coercion.ts               ← asString, asNumber, asBoolean, asStringArray
│       ├── datePicker.ts
│       ├── dialog.ts
│       ├── group.ts                  ← group element (write/read/click + delegation)
│       ├── group-batch.ts            ← writeAll / readAll
│       ├── group-find.ts             ← find() scoping
│       ├── group-override.ts         ← overrideHandler() immutable builder
│       ├── group-resolution.ts       ← label resolution integration
│       ├── group-types.ts            ← GroupElement interface, FieldValues
│       ├── radio.ts
│       ├── select.ts
│       ├── stepper.ts
│       ├── table.ts
│       ├── text.ts
│       ├── textInput.ts
│       ├── toast.ts
│       └── types.ts                  ← element-level type definitions
│
├── tests/
│   ├── pages/
│   │   ├── home.ts                   ← home page composition
│   │   └── about.ts                  ← about page composition
│   │
│   ├── button-output-toast.spec.ts   (8 tests)
│   ├── by-strategies.spec.ts         (12 tests)
│   ├── dialog.spec.ts                (6 tests)
│   ├── dynamic-content.spec.ts       (5 tests)
│   ├── group-filter-bar.spec.ts      (12 tests)
│   ├── group-find.spec.ts            (3 tests)
│   ├── group-order-controls.spec.ts  (20 tests)
│   ├── navigation.spec.ts            (8 tests)
│   ├── network-settle.spec.ts        (7 tests)
│   ├── override-escape.spec.ts       (6 tests)
│   ├── override-handler.spec.ts      (4 tests)
│   ├── read-typed.spec.ts            (4 tests)
│   ├── table-data.spec.ts            (11 tests)
│   ├── table-row-refresh.spec.ts     (3 tests)
│   ├── table-rows.spec.ts            (7 tests)
│   ├── functional-swap.spec.ts       (16 tests)
│   │
│   └── unit/                         (21 files, 312 tests)
│       ├── click-in-container.spec.ts
│       ├── coercion.spec.ts
│       ├── context.spec.ts
│       ├── create-handler.spec.ts
│       ├── date-picker-adapter.spec.ts
│       ├── element-classifier.spec.ts
│       ├── errors.spec.ts
│       ├── handlers.spec.ts
│       ├── label-resolution.spec.ts
│       ├── logger.spec.ts
│       ├── middleware.spec.ts
│       ├── resolve-retry.spec.ts
│       ├── retry.spec.ts
│       ├── select-adapter.spec.ts
│       └── strict-context.spec.ts
│
├── playwright.config.ts              ← integration tests (browser required)
├── playwright.unit.config.ts         ← unit tests (no browser needed)
├── tsconfig.json
└── package.json
```

---

## API Reference

Full API documentation is generated from source JSDoc using [TypeDoc](https://typedoc.org/):

```bash
npm run docs          # generate docs/api/
npm run docs:open     # generate and open in browser
```

The generated docs cover all four export paths:

| Import Path | Purpose |
|-------------|--------|
| `@playwright-elements/core` | Consumer API — `By`, element factories, adapters, errors, context, retry |
| `@playwright-elements/core/extend` | Extension API — handler registration, middleware, element wrapping |
| `@playwright-elements/core/test-fixture` | Playwright `test` fixture with auto-context |
| `@playwright-elements/core/internals` | Unstable internals — collaborator classes (semver-exempt) |

---

## Test Coverage

1376 tests across 39 spec files (18 integration × 7 apps + 21 unit), all passing:

### Cross-App Compatibility

| App | Port | Technology + Component Library | Tests | Status |
|-----|------|-------------------------------|-------|--------|
| vanilla-html | 3001 | Plain HTML/JS (baseline — no library) | 149 | ✅ |
| react-app | 3002 | React + MUI `@mui/material` ^7.3.9 + react-datepicker | 149 | ✅ |
| vue-app | 3003 | Vue + Vuetify ^4.0.2 + @vuepic/vue-datepicker | 149 | ✅ |
| angular-app | 3004 | Angular + Angular Material ^19.2.19 (mat-datepicker, MatDialog, MatSnackBar) | 149 | ✅ |
| svelte-app | 3005 | Svelte 5 + Bits UI ^2.16.3 + flatpickr | 149 | ✅ |
| nextjs-app | 3006 | Next.js + MUI `@mui/material` ^7.3.9 + react-datepicker + custom toast | 149 | ✅ |
| lit-app | 3007 | Lit + Shoelace ^2.20.1 (shadow DOM) + native date input | 149 | ✅ |
| **Total** | | **6 component libraries + vanilla baseline** | **1064** | **✅** |

Each app uses its framework's idiomatic component library, producing fundamentally different DOM structures (shadow DOM, portaled dropdowns, ARIA widgets, virtual tables). The framework handles all of them with generic ARIA/role-based detection — library-specific logic is isolated in adapters (`DatePickerAdapter`, `SelectAdapter`, checkbox `force: true` fallback).

Key adapter components:
- **`SelectAdapter`** (`src/elements/select-adapter.ts` interface, `src/adapters/generic-select-adapter.ts` implementation) — Handles non-editable selects across all libraries: double `requestAnimationFrame` render flush, expanded-but-invisible recovery, 4-strategy option-finding cascade (aria-controls → nearby XPath → page-level getByRole → CSS selector fallback).
- **`DatePickerAdapter`** (`src/elements/`) — Technology-specific date picker adapters in `src/adapters/`.
- **Checkbox/Radio** — Try-then-fallback pattern: normal interaction first, `force: true` only on failure (handles both MUI hidden inputs and Shoelace shadow DOM).

### Integration tests (152 tests per app, 18 files)

| Spec | Tests | Covers |
|------|-------|--------|
| by-strategies | 12 | By factories (label, role, css, text, shadow, within, first, any), toString() |
| button-output-toast | 8 | Button click, action output, toast visibility + auto-dismiss |
| dialog | 6 | Dialog open/close, escape key, backdrop click, focus trap, content reading |
| dynamic-content | 5 | Delayed content, form validation, item list |
| group-filter-bar | 12 | group write/read, writeAll/readAll, checkbox/select/text input auto-detection, AND filter composition, category options |
| group-find | 3 | find() scoping, ElementNotFoundError, AmbiguousMatchError |
| group-order-controls | 20 | Radiogroup auto-detection, stepper (incl. min/max clamping), date picker (incl. clear), group.click(), find() scoping |
| navigation | 8 | Page routing, about text, nav links, footer, browser back/forward |
| network-settle | 9 | Network settle middleware: delayed responses, concurrent calls, timeout, ignored URLs, callbacks, action scoping, real fetch/HTTP requests |
| override-escape | 6 | Direct Playwright access via locator(), raw CSS selectors, withTimeout() |
| override-handler | 4 | overrideHandler() with string type, object literal, immutability, invalid type |
| read-typed | 4 | readTyped() for string, boolean, select, kind mismatch error |
| table-data | 11 | Table rows, sorting (name, price, stock, category), filtering, empty state, emptyText |
| table-row-refresh | 3 | Row refresh after sort, filter, row-gone error |
| table-rows | 7 | Row-level scoping, dialog trigger from table, content matching |
| functional-swap | 16 | Generated-vs-hand-written page objects, write/read/click via crawler manifests |
| aria-validation | 8 | ARIA attributes: aria-live on toast, dialog role/title, table role, accessible names, radio group role, checkbox aria-checked |
| keyboard-navigation | 7 | Tab/Shift+Tab order, arrow keys in radio group, Enter activates button, dialog focus trap, Escape closes dialog, Space toggles checkbox |

### Unit tests (312 tests, 21 files)

| Spec | Covers |
|------|--------|
| click-in-container | clickInContainer logic |
| coercion | asString, asNumber, asBoolean, asStringArray |
| context | FrameworkContext creation, isolation, reset |
| create-handler | createHandler / getDefaultHandlerByType |
| date-picker-adapter | DatePickerAdapter contract |
| dom-helpers | cssEscape, DOM utility functions |
| element-classifier | classifyElement: tag/role/attr matching, requireChild, priority, fallback |
| errors | All 4 error classes: context, messages, inheritance |
| handlers | Handler detection, registration, role fallbacks |
| label-resolution | normalizeRadioLabel, resolveInputLabel, readCheckedRadioLabel, resolveLabeled |
| logger | LoggerConfig, configureLogger |
| middleware | MiddlewarePipeline, useMiddleware, nested-action guard, forceMiddleware |
| playwright-error-patterns | Error classification against current Playwright error messages |
| playwright-errors | isDetachedError, isTimeoutError, and other Playwright error guards |
| resolve-retry | ResolveRetryConfig, configureResolveRetry |
| retry | retryUntil, RetryResult discriminated union |
| select-adapter | SelectAdapter contract, nativeSelectAdapter, comboboxSet editable/non-editable detection |
| strict-context | setStrictContextMode, checkMutationScope, resetWarningState |
| wrap-element | ACTIONS symbol, forceMiddleware, validation, Symbol.toStringTag |

---

## Design Principles

1. **Label-first identification.** `write("Category", "Electronics")` — not `page.locator("select").selectOption("Electronics")`.
2. **Auto-detect, don't declare.** The handler registry figures out what kind of element "Category" is.
3. **Typed wrappers only for rich behaviour.** Standard form interactions go through `group.write()`/`group.read()`. Typed wrappers exist for `table.sort()`, `stepper.increment()`, `dialog.close()`, etc.
4. **Single evaluate() detection.** Element classification happens in one browser round-trip.
5. **Extensible registry.** Add a handler → everything adapts. No switch blocks to update.
6. **Structured errors.** Custom error classes (`ElementNotFoundError`, `AmbiguousMatchError`, `ColumnNotFoundError`, `NoHandlerMatchError`) carry context (query, tried strategies, match count, available columns, tag/role) for fast debugging.
7. **Technology adapters.** `DatePickerAdapter` lets the same test code drive native `<input type="date">`, react-datepicker, vue-datepicker, mat-datepicker, and flatpickr. `SelectAdapter` lets the same test code drive native `<select>`, component library comboboxes (MUI, Angular Material, Vuetify, Shoelace), with editable vs non-editable auto-detection. Adapters live in `src/elements/` (interfaces) and `src/adapters/` (technology-specific implementations).

---

## Architecture Decisions

### AD-1: Two Interaction Systems — Handler Registry vs Typed Wrappers

The framework provides two distinct interaction paths for DOM elements. This is a **permanent design decision**, not an accident.

#### Handler registry path (`group.write()` / `group.read()`)

```ts
const home = group(By.css("body"), page);
await home.write("Category", "Electronics");   // auto-detect → combobox handler → set()
const val = await home.read("Category");        // auto-detect → combobox handler → get()
```

- **How it works:** `resolveLabeled()` finds the element by label, `detectHandler()` classifies it by tag/role/ARIA attributes, then the matching handler's `set()` / `get()` is called.
- **Modified via:** `registerHandler()`, `unregisterHandler()`, `createHandler()` from the extension API.
- **Best for:** Standard form controls where write/read semantics suffice (text input, checkbox, select, radio group, combobox, slider, switch).

#### Typed wrapper path (`select().choose()`, `table.sort()`, etc.)

```ts
const dropdown = select(By.label("Category"), page, { adapter: muiSelectAdapter });
await dropdown.choose("Electronics");
const rows = await table(By.css("table"), page).rows();
```

- **How it works:** The typed wrapper factory (`select()`, `table()`, etc.) creates a purpose-built element object with rich methods. Some methods delegate to the handler registry (e.g. `select.choose()` calls `requireHandler(ctx, "select").set(...)` when no custom adapter is provided). Others have bespoke implementations (e.g. `table.sort()` clicks header cells directly, `stepper.increment()` clicks buttons in a loop).
- **Modified via:** Adapter injection (`SelectAdapter`, `DatePickerAdapter`, `TableAdapter`) or building custom typed wrappers with `wrapElement()`.
- **Best for:** Elements needing operations beyond write/read — sorting, pagination, increment/decrement, open/close, wait-for-dismiss, row-level scoping.

#### Why they are separate

| Concern | Handler Registry | Typed Wrappers |
|---------|:---|:---|
| **Scope** | Generic write/read for any labeled element | Rich domain methods per element type |
| **Discovery** | Automatic (detect rules → classify) | Explicit (caller specifies the element type) |
| **Extensibility** | `registerHandler()` adds to the shared registry | New wrapper = new function returning a `wrapElement()` object |
| **Adapters** | Swap `set`/`get` via `overrideHandler()` | Swap via constructor option (`adapter:`) |

Merging the two would force every typed wrapper to go through the handler registry for all operations — including domain-specific methods like `sort()`, `increment()`, and `close()` that have no meaningful `set(el, value)` analogue. The registry provides the auto-detection and write/read backbone; typed wrappers provide rich APIs atop it.

#### When to use each

| Scenario | Path |
|----------|------|
| Fill a form field by label | `group.write()` / `group.read()` |
| Toggle a checkbox, select an option, click a button | `group.write()` |
| Sort a table, read all rows, find a row | `table()` typed wrapper |
| Increment/decrement a stepper | `stepper()` typed wrapper |
| Open/close a dialog, read its title | `dialog()` typed wrapper |
| Custom component with write/read only | `registerHandler()` in extension API |
| Custom component with rich methods | Build a typed wrapper with `wrapElement()` |

### AD-2: Adapter Pattern — Current Coverage and Extension Points

The adapter pattern provides technology-specific interaction strategies behind a stable interface. Different component libraries produce fundamentally different DOM structures for the same logical widget, so adapters isolate that complexity.

#### Elements with adapter interfaces

| Element | Adapter Interface | Implementations | Rationale |
|---------|------------------|-----------------|-----------|
| **Select/Combobox** | `SelectAdapter` | `nativeSelectAdapter`, `genericNonEditableSelectAdapter`, `editableSelectAdapter` | Component library selects vary enormously: native `<select>`, shadow DOM `<sl-select>`, portaled MUI/Vuetify dropdowns, editable autocomplete inputs |
| **Date Picker** | `DatePickerAdapter` | `nativeDatePickerAdapter`, `reactDatePickerAdapter`, `vueDatePickerAdapter`, `matDatePickerAdapter`, `flatpickrAdapter` | Date pickers have no standard DOM structure — each library renders months, day grids, and navigation differently |
| **Table** | `TableAdapter` | `defaultTableAdapter` | Table markup varies (standard HTML table vs. `div`-based virtual tables like AG Grid). Adapter provides CSS selectors for headers, rows, cells, empty state, and an optional `sort()` override for libraries with non-standard sort triggers |

#### Elements with inline fallback strategies (no formal adapter yet)

| Element | Strategy | When an adapter might be needed |
|---------|----------|-------------------------------|
| **Checkbox/Radio** | Try normal `check()` → catch → retry with `force: true` | If a component library uses a completely non-standard toggle mechanism (beyond shadow DOM overlay) |
| **Dialog close** | Escape key → close button fallback | If a library uses a non-standard close trigger (e.g. clicking a custom overlay backdrop) |
| **Toast** | CSS selector with `aria-live="polite"` | If a library renders toasts in a shadow root (Lit/Shoelace — may need shadow-piercing selector) |

These elements use inline fallback chains that work across all 7 test apps today. Formal adapter interfaces will be created when a concrete failure is observed with a new component library — designing adapters speculatively adds complexity without proven benefit.
