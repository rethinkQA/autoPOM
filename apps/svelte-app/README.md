# GeneralStore — Svelte

> Svelte 5 + TypeScript, powered by Vite.

## Technology

- **Framework:** Svelte 5 (with runes: `$state`, `$derived`, `$effect`)
- **Language:** TypeScript
- **Build tool:** Vite 7
- **Routing:** Hash-based via `hashchange` event listener
- **Date picker:** Flatpickr (via Svelte action)
- **Toast:** Custom reactive store (`$state`-based class)

## Start

```bash
npm install   # first time only
npm start     # serves on http://localhost:3005
```

**Port:** 3005

## UI Contract

This app implements the full GeneralStore UI contract as defined in [`shared/ui-contract.md`](../../shared/ui-contract.md).

### Pages

| Route | Content |
|-------|---------|
| `#/` (default) | Product catalog with all interactive elements |
| `#/about` | Store description |

### Element Identification

Elements are identified using native HTML semantics rather than `data-testid` attributes:

- **Page structure:** Semantic elements (`<header>`, `<nav>`, `<main>`, `<footer>`), ARIA roles, and CSS classes
- **Interactive elements:** `id` attributes, ARIA labels, `role` attributes, and semantic elements (e.g., `<dialog>`, `<table>`, `<select>`)
- **Dynamic content:** CSS classes, ARIA live regions, and semantic markup

## File Structure

```
svelte-app/
├── src/
│   ├── lib/
│   │   └── toast.svelte.ts  ← custom toast store (Svelte 5 runes)
│   ├── pages/
│   │   ├── Home.svelte      ← product catalog + all interactive elements
│   │   └── About.svelte     ← store description
│   ├── App.svelte           ← layout + hash routing + toast display
│   ├── app.css              ← all styles
│   ├── data.ts              ← canonical product data + constants
│   ├── main.ts              ← entry point (Svelte 5 mount API)
│   └── vite-env.d.ts        ← type declarations
├── index.html
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── package.json
└── README.md                ← this file
```

## Svelte 5 Patterns Used

- **Runes:** `$state()` for reactive variables, `$derived.by()` for computed values, `$effect()` for side effects with cleanup
- **Actions:** `use:useFlatpickr` for Flatpickr date picker integration (idiomatic Svelte pattern)
- **Reactive class:** Toast store uses `$state` fields in a class exported from a `.svelte.ts` module
- **Event handlers:** Svelte 5 lowercase syntax (`onclick`, `onkeydown`, `onchange`)
- **Directives:** `bind:value`, `bind:checked`, `bind:group`, `class:active`

## Caveats

- Uses hash-based routing with a `hashchange` listener rather than a routing library, for simplicity and consistency with the vanilla-html approach.
- The modal uses a `<dialog>` element with the `open` attribute (controlled by Svelte state) rather than `.showModal()`, matching the React app's approach.
- Flatpickr is integrated via a Svelte action (`use:useFlatpickr`) — this is the idiomatic Svelte equivalent of the `svelte-flatpickr` wrapper library.
- Vite 7 requires Node 20.19+. The app builds on Node 20.18 with engine warnings.
- Scaffolding tool versions: Vite 7.3.1, Svelte 5.51.2, @sveltejs/vite-plugin-svelte 6.2.4.
