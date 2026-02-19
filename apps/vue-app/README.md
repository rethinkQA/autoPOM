# GeneralStore — Vue App

> Vue 3 (Composition API) + TypeScript + Vite implementation of the GeneralStore test target.

## Tech Stack

| Tool | Version |
|------|---------|
| Vue | 3.5.x |
| TypeScript | ~5.9 |
| Vite | 7.3.x |
| vue-router | 4.x |
| @vuepic/vue-datepicker | 12.x |

## Quick Start

```bash
cd apps/vue-app
npm install    # first time only
npm start      # serves on http://localhost:3003
```

## Port

**3003** (configured in `vite.config.ts` and the `start` script)

## UI Contract

All elements from the [UI Contract](../../shared/ui-contract.md) are implemented and identified using semantic HTML, ARIA attributes, and CSS classes (no `data-testid` attributes).

### Page Structure
- `<header>` — Header with "GeneralStore" + Vue badge
- `<nav>` links — vue-router `<RouterLink>` navigation
- `<main>` — `<RouterView>` container
- About page paragraph — About page description
- `<footer>` — Footer

### Interactive Elements
- Text `<input>` — Product search filter (identified by `id` / ARIA label)
- Action `<button>` — "Add to Cart" (main + per-row)
- Output element — Confirmation message
- Checkbox `<input>` — "Show only in-stock items"
- `<select>` — Category filter (All, Electronics, Books, Clothing)
- Radio `<fieldset>` — Shipping method radios (Standard/Express/Overnight)
- Radio output — Selected shipping cost
- `<table>` — Product catalog table
- Sortable `<th>` buttons — Column headers (asc ↔ desc)
- Filter controls container — Filter area
- Empty state row — "No products found."
- Date picker — `@vuepic/vue-datepicker` component
- Date output — Formatted selected date
- Quantity stepper — Input with increment/decrement buttons (1–99)
- Modal trigger — Product name button opens modal
- `<dialog>` — Native dialog element
- Close button — Inside modal
- Toast — Custom composable, auto-dismiss 3s (`aria-live`)

### Dynamic Content
- Item list — Static list of 3 popular items
- Delayed content — Appears after 1.5s delay
- Validation message — Shown on empty search submit

## Technology-Native Components

| Element | Implementation |
|---------|---------------|
| Date picker | `@vuepic/vue-datepicker` |
| Modal | Native `<dialog>` with `showModal()` |
| Toast | Custom Vue composable (`src/composables/useToast.ts`) |
| Select | Native `<select>` |

## Routing

Hash-based routing via `vue-router` with `createWebHashHistory()`:
- `/#/` → Home
- `/#/about` → About

## Notes

- The `vue-toastification` library (suggested in REQUIREMENTS.md) was evaluated but is incompatible with Vue 3.5 at its current RC version. A custom toast composable provides the same behavior (auto-dismiss after 3s, `aria-live` region).
- All filters are AND-ed (text × category × in-stock).
- Sort toggles between ascending and descending only (no neutral state).
