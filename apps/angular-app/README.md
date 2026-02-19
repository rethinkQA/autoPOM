# GeneralStore — Angular App

> **Technology:** Angular 19 (standalone components, Angular Material 19)
> **Port:** 3004
> **Scaffolded with:** `@angular/cli@19`

## Quick Start

```bash
cd apps/angular-app
npm install    # first time only
npm start      # serves on http://localhost:3004
```

## Technology-Native Components

Per the UI contract (§6.7), this app uses Angular Material for:

| Element | Implementation |
|---------|---------------|
| Date picker | `@angular/material` `MatDatepicker` with native date adapter |
| Modal / Dialog | `@angular/material` `MatDialog` |
| Toast | `@angular/material` `MatSnackBar` + inline toast div with ARIA live region |
| Select | Native `<select>` |
| Data table | Native `<table>` |

## Routing

Uses Angular Router with hash-based routing (`withHashLocation()`):
- `/#/` — Home (product catalog)
- `/#/about` — About page

## UI Contract Coverage

All elements from `shared/ui-contract.md` are implemented. Elements are identified using semantic HTML, ARIA attributes, and CSS classes (no `data-testid` attributes):

- **Page structure:** Semantic elements (`<header>`, `<nav>`, `<main>`, `<footer>`), ARIA roles, and CSS classes
- **Interactive elements:** `id` attributes, ARIA labels, `role` attributes, and semantic elements (e.g., `<dialog>`, `<table>`, `<select>`)
- **Dynamic content:** CSS classes, ARIA live regions, and semantic markup

## Versions

| Package | Version |
|---------|---------|
| Angular | 19.2.x |
| Angular Material | 19.2.x |
| Angular CDK | 19.2.x |
| TypeScript | ~5.7.2 |

