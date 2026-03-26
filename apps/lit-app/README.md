# GeneralStore — Lit Web Components

A minimal "GeneralStore" storefront built with **Lit 3** web components. This app is the **Shadow DOM stress test** for the Playwright testing framework — it validates shadow DOM piercing and interaction strategies.

## Technology

| Item | Version |
|------|---------|
| Lit | ~3.2.1 |
| Vite | ~7.3.1 |
| TypeScript | ~5.9.3 |
| Node.js | 20 LTS (see root `.nvmrc`) |

## Quick Start

```bash
cd apps/lit-app
npm install    # first time only
npm start      # serves on http://localhost:3007
```

## Port

**3007** (configured in `vite.config.ts` and `package.json`)

## Shadow DOM Architecture (§6.5)

This app uses a **light DOM / shadow DOM split** to validate both standard and shadow DOM piercing selectors:

### Light DOM (no piercing needed)

Structural/page-level elements render into light DOM via `createRenderRoot() { return this; }`:

| Element | Selector Strategy | Component |
|---------|-------------------|-----------|
| Header | `<header>` element | `general-store-app` |
| Navigation | `<nav>` links | `general-store-app` |
| Main Content | `<main>` element | `general-store-app` |
| About Text | Paragraph inside about component | `general-store-about` |
| Footer | `<footer>` element | `general-store-app` |

Standard Playwright locator: `page.locator('header')`, `page.locator('nav a')`

### Shadow DOM (piercing required)

All interactive elements are inside `<general-store-home>`'s shadow root. They are identified by semantic HTML, ARIA attributes, `id`s, and CSS classes — no `data-testid` attributes:

| Element | Selector Strategy |
|---------|-------------------|
| Text input | `<input>` with `id` or ARIA label |
| Action button | `<button>` with text content / class |
| Action output | Output element with CSS class |
| Toggle checkbox | `<input type="checkbox">` |
| Select dropdown | `<select>` element |
| Radio group | `<fieldset>` with radio inputs |
| Radio output | Output element with CSS class |
| Data table | `<table>` element |
| Table sort | `<th>` buttons |
| Table filter | Filter container with CSS class |
| Empty state | Row with CSS class |
| Date picker | `<input type="date">` |
| Date output | Output element with CSS class |
| Quantity input | `<input type="number">` |
| Quantity increment/decrement | `<button>` with ARIA label |
| Modal trigger | Product name button |
| Modal dialog | `<dialog>` element |
| Modal close | Close `<button>` inside `<dialog>` |
| Toast notification | `aria-live` region |
| Item list | `<ul>` with CSS class |
| Delayed content | Element with CSS class |
| Validation message | `aria-live` validation element |

Shadow DOM piercing locator: `page.locator('general-store-home').locator('table')`, `page.locator('general-store-home').locator('dialog')`

## Component Structure

| File | Component | Shadow DOM? | Purpose |
|------|-----------|-------------|---------|
| `general-store-app.ts` | `<general-store-app>` | No (light DOM) | App shell — header, nav, footer |
| `general-store-home.ts` | `<general-store-home>` | **Yes** | Home page — all interactive elements |
| `general-store-about.ts` | `<general-store-about>` | No (light DOM) | About page — store description |
| `general-store-dialog.ts` | `<general-store-dialog>` | **Yes** | Product detail modal (native `<dialog>`) |
| `general-store-toast.ts` | `<general-store-toast>` | **Yes** | Auto-dismiss toast notification |
| `data.ts` | — | — | Canonical product data, categories, shipping |

## UI Contract Notes

- Uses **native `<input type="date">`** for the date picker (per §6.7 — Lit stays fully native)
- Uses **native `<dialog>`** for the modal (inside shadow DOM)
- Uses **custom toast** (inside shadow DOM)
- Uses **native `<select>`** for the category dropdown
- Elements are identified via semantic HTML, ARIA attributes, and CSS classes (no `data-testid` attributes)
- Canonical product dataset with 7 products across 3 categories

## Caveats

- The `<dialog>` element is nested inside a shadow root. Playwright's `showModal()` / `close()` behavior works the same, but selectors need shadow piercing.
- Toast auto-dismisses after ~3 seconds. Assertions should be made promptly after the triggering action.
- Delayed content loads after ~1.5 seconds via `setTimeout`.
