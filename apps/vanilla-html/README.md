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

This app implements the full GeneralStore UI contract as defined in [`shared/ui-contract.md`](../../shared/ui-contract.md).

### Pages

| Route | Content |
|-------|---------|
| `#home` (default) | Product catalog with all interactive elements |
| `#about` | Store description |

### All `data-testid` Attributes

Page structure: `app-header`, `nav-home`, `nav-about`, `main-content`, `about-text`, `app-footer`

Interactive elements: `text-input`, `action-button`, `action-output`, `toggle-checkbox`, `select-dropdown`, `radio-group`, `radio-output`, `data-table`, `table-sort`, `table-filter`, `empty-state`, `date-picker`, `date-output`, `quantity-input`, `quantity-increment`, `quantity-decrement`, `modal-trigger`, `modal-dialog`, `modal-close`, `toast-notification`

Dynamic content: `item-list`, `delayed-content`, `validation-message`

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
