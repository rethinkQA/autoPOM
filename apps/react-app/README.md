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

This app implements the full GeneralStore UI contract as defined in [`shared/ui-contract.md`](../../shared/ui-contract.md).

### Pages

| Route | Content |
|-------|---------|
| `#/` (default) | Product catalog with all interactive elements |
| `#/about` | Store description |

### All `data-testid` Attributes

Page structure: `app-header`, `nav-home`, `nav-about`, `main-content`, `about-text`, `app-footer`

Interactive elements: `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `radio-output`, `data-table`, `table-sort`, `table-filter`, `empty-state`, `date-picker`, `date-output`, `quantity-input`, `quantity-increment`, `quantity-decrement`, `modal-trigger`, `modal-dialog`, `modal-close`, `toast-notification`

Dynamic content: `item-list`, `delayed-content`, `validation-message`

## File Structure

```
react-app/
├── src/
│   ├── pages/
│   │   ├── Home.tsx       ← product catalog + all interactive elements
│   │   └── About.tsx      ← store description
│   ├── App.tsx            ← layout + routing
│   ├── App.css            ← all styles
│   ├── data.ts            ← canonical product data + constants
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
