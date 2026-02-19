# GeneralStore — Next.js App

A minimal **GeneralStore** storefront built with Next.js (App Router, SSR dev mode) and TypeScript.
This app serves as a test target for a Playwright-based testing framework.

## Technology

| Detail | Value |
|--------|-------|
| Framework | Next.js 16.x (App Router) |
| Language | TypeScript |
| Date Picker | react-datepicker |
| Toast | react-hot-toast |
| Modal | Native `<dialog>` |
| Port | 3006 |

## Quick Start

```bash
npm install    # first time only
npm start      # starts Next.js dev server on http://localhost:3006
```

## SSR / Hydration Notes

- Runs via `next dev` in **SSR dev mode**. Pages are server-rendered and hydrated on the client.
- The layout (`app/layout.tsx`) is a **server component**.
- Navigation (`app/components/Nav.tsx`) and Home page (`app/HomeClient.tsx`) are **client components** (`'use client'`).
- The About page (`app/about/page.tsx`) is a **server component** with no interactive state.
- Hydration edge cases: Interactive elements only work after hydration completes. The test framework should wait for hydration before interacting.

## UI Contract

All elements from the shared [UI Contract](../../shared/ui-contract.md) are implemented. Elements are identified using semantic HTML, ARIA attributes, and CSS classes (no `data-testid` attributes).

## Scaffolding

Scaffolded with `create-next-app@16.1.6` using the App Router template.
