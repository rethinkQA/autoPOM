# GeneralStore — React

> React 19 + TypeScript, powered by Vite.

## Technology

- **Framework:** React 19 (with react-router-dom for routing)
- **Language:** TypeScript
- **Build tool:** Vite 7
- **Routing:** Hash-based via `HashRouter`

## Start

```bash
npm install   # first time only
npm start     # serves on http://localhost:3002
```

**Port:** 3002

## UI Contract

This app implements the full GeneralStore UI contract as defined in [REQUIREMENTS.md §6](../../docs/REQUIREMENTS.md).

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
react-app/
├── src/
│   ├── pages/
│   │   ├── Home.tsx       ← product catalog + all interactive elements
│   │   └── About.tsx      ← store description
│   ├── App.tsx            ← layout + routing
│   ├── App.css            ← all styles
│   ├── main.tsx           ← entry point
│   └── index.css
├── index.html
├── vite.config.ts
├── package.json
└── README.md              ← this file
```

## Caveats

- Uses `HashRouter` (not `BrowserRouter`) for consistency with the vanilla-html hash-based routing pattern.
- The modal uses a `<dialog>` element with the `open` attribute (controlled by React state) rather than `.showModal()` to avoid imperative DOM calls. Backdrop click works via the dialog's own click handler.
- Vite version 7 requires Node 20.19+. The app still works on Node 20.18 with engine warnings.
