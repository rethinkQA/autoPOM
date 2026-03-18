# GeneralStore — Vanilla HTML

> Plain HTML / CSS / JavaScript — no framework, no build step.

## Technology

- **Language:** JavaScript (no TypeScript)
- **Build tools:** None
- **Dev server:** `serve` (via npx)
- **Routing:** Hash-based (`#home`, `#about`)

## Start

```bash
npm install   # first time only (no dependencies — installs serve globally via npx)
npm start     # serves on http://localhost:3001
```

**Port:** 3001

## UI Contract

This app implements the full GeneralStore UI contract as defined in [REQUIREMENTS.md §6](../../docs/REQUIREMENTS.md).

### Pages

| Route | Content |
|-------|---------|
| `#home` (default) | Product catalog with all interactive elements |
| `#about` | Store description |

### Element Identification

Elements are identified using native HTML semantics rather than `data-testid` attributes:

- **Page structure:** Semantic elements (`<header>`, `<nav>`, `<main>`, `<footer>`), ARIA roles, and CSS classes
- **Interactive elements:** `id` attributes, ARIA labels, `role` attributes, and semantic elements (e.g., `<dialog>`, `<table>`, `<select>`)
- **Dynamic content:** CSS classes, ARIA live regions, and semantic markup

## Caveats

- This app uses `npx serve` which downloads `serve` on first run. Subsequent starts are instant.
- The `<dialog>` element is used for the modal. All modern browsers support it.
- Hash-based routing means no server-side routing logic is needed.

## File Structure

```
vanilla-html/
├── index.html      ← single page, all structure
├── style.css       ← all styles
├── app.js          ← all behavior (no modules, single file)
├── package.json    ← start script only
└── README.md       ← this file
```
