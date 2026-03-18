# @playwright-elements/crawler

Runtime crawler that discovers **groups and containers** on a live page and emits a JSON manifest for page object generation.

## Design Principles

- **Groups, not elements.** The framework's `group.write()` auto-detects element types at runtime via the handler registry. The crawler only finds the named regions of the page.
- **4 special wrappers.** Only `table()`, `dialog()`, `toast()`, and `datePicker()` need explicit detection because they have interaction semantics that `group()` can't express.
- **User-driven multi-pass.** The crawler doesn't automate interactions. Put the page in a desired state (open a dialog, reveal a section), then re-run. The manifest is append-only.
- **Shadow DOM piercing.** The crawler traverses Shadow DOM boundaries, making it work with web component frameworks (Lit/Shoelace).

## Installation

```bash
npm install @playwright-elements/crawler
```

## CLI Usage

```bash
# Crawl a page, emit manifest to stdout
npx pw-crawl http://localhost:3001

# Write manifest to file
npx pw-crawl http://localhost:3001 -o manifest.json

# Multi-pass: open a dialog, then re-crawl (append-only merge)
npx pw-crawl http://localhost:3001 -o manifest.json --pass 2

# Limit crawl to a section
npx pw-crawl http://localhost:3001 --scope ".main-content"

# Diff current DOM against existing manifest (CI drift detection)
npx pw-crawl http://localhost:3001 --diff manifest.json

# Include API dependency discovery
npx pw-crawl http://localhost:3001 --observe-network -o manifest.json

# Run browser in headed mode (visible)
npx pw-crawl http://localhost:3001 --headed
```

### Generate Page Objects

```bash
# Generate page objects from a single manifest
npx pw-crawl generate manifest.json -o pages/

# CI mode: exit 1 if generated output differs from existing files
npx pw-crawl generate manifest.json --check pages/

# Multi-route with template detection (shared nav/footer → template factory)
npx pw-crawl generate home.json about.json -o pages/

# Custom config for property name overrides
npx pw-crawl generate manifest.json --config .pw-crawl.json -o pages/

# Custom framework import path
npx pw-crawl generate manifest.json --framework-import ../../src/index.js -o pages/
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | Success, or no drift when using `--diff` |
| `1`  | Error, or manifest changed when using `--diff` |

## Programmatic API

```typescript
import { chromium } from "playwright";
import { crawlPage, diffPage } from "@playwright-elements/crawler";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3001");

// Crawl the page
const manifest = await crawlPage(page);
console.log(JSON.stringify(manifest, null, 2));

// Multi-pass merge
const pass2 = await crawlPage(page, { pass: 2 }, manifest);

// Diff against existing manifest
const diff = await diffPage(page, manifest);
console.log(diff.unchanged ? "No drift" : "Drift detected");

await browser.close();
```

## Manifest Schema

```json
{
  "url": "http://localhost:3001/",
  "timestamp": "2026-03-16T...",
  "scope": null,
  "passCount": 1,
  "groups": [
    {
      "label": "Shipping Method",
      "selector": "fieldset[aria-label=\"Shipping Method\"]",
      "groupType": "fieldset",
      "wrapperType": "group",
      "discoveredIn": "pass-1",
      "visibility": "static",
      "lastSeen": "2026-03-16T..."
    },
    {
      "label": "data-table",
      "selector": "table.data-table",
      "groupType": "generic",
      "wrapperType": "table",
      "discoveredIn": "pass-1",
      "visibility": "static",
      "lastSeen": "2026-03-16T..."
    }
  ],
  "apiDependencies": [
    {
      "pattern": "/api/products",
      "method": "GET",
      "timing": "page-load"
    }
  ]
}
```

### Group Types

| Type | Source |
|------|--------|
| `nav` | `<nav>` or `role="navigation"` |
| `header` | `<header>` |
| `footer` | `<footer>` |
| `main` | `<main>` |
| `aside` | `<aside>` |
| `section` | `<section>` with label |
| `fieldset` | `<fieldset>` or `role="group"` |
| `form` | `<form>` |
| `region` | `role="region"` |
| `toolbar` | `role="toolbar"` |
| `tablist` | `role="tablist"` |
| `menu` | `role="menu"` |
| `menubar` | `role="menubar"` |
| `details` | `<details>` |
| `generic` | Other matched elements |

### Wrapper Types

| Type | When | Code Generation |
|------|------|-----------------|
| `group` | Default for most groups | `group(By.role(...), page)` |
| `table` | `<table>` or `role="table"` | `table(By.role("table"), page)` |
| `dialog` | `<dialog>` or `role="dialog"` | `dialog(By.role("dialog"), page)` |
| `toast` | `[aria-live]` with toast role/class | `toast(By.css("[aria-live]"), page)` |

## Label Resolution

Each discovered group gets a human-readable label via an 11-priority chain:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `aria-label` attribute | `<nav aria-label="Main">` → `"Main"` |
| 2 | `aria-labelledby` (resolved text) | `<section aria-labelledby="hdr">` → text of `#hdr` |
| 3 | `<legend>` child | `<fieldset><legend>Shipping</legend>` → `"Shipping"` |
| 4 | `<summary>` child | `<details><summary>Info</summary>` → `"Info"` |
| 5 | Direct heading child (`h1`–`h6`) | `<main><h1>Products</h1>` → `"Products"` |
| 6 | Deep descendant heading | MUI Dialog with nested `<h2>` → heading text |
| 7 | `title` attribute | `<section title="Sidebar">` → `"Sidebar"` |
| 8 | Nearest ancestor `aria-label` | Parent with `aria-label` → inherited label |
| 9 | First meaningful text content | First text node via TreeWalker |
| 10 | `id` attribute (human-authored) | `<table id="products">` → `"products"` |
| 11 | Tag name (fallback) | `<footer>` → `"footer"` |

### Framework ID Filtering

React, Vue, and Angular generate synthetic IDs (e.g., `_r_4_`, `:r0:`, `data-v-abc123`, `_ngcontent-xxx`). These are automatically filtered out at priorities 2 and 10 so the label falls through to a more meaningful source.

## Merge Behavior

The manifest uses **append-only** merging across multiple crawler passes:

1. Groups matched by `selector` are **updated** (label refresh, timestamp bump)
2. New groups are **appended** with `discoveredIn: "pass-N"`
3. Groups not found in current DOM are **kept** (append-only) with original `lastSeen`
4. Users can manually delete stale entries

## Framework-Specific Notes

| Framework | Notes |
|-----------|-------|
| **Vanilla HTML** | All groups discoverable in pass 1, including `<dialog>` and toast |
| **React (MUI)** | Dialog portaled to `<body>` — needs pass 2 after opening |
| **Vue (Vuetify)** | Dialog/toast use overlay teleport — needs pass 2 |
| **Angular (Material)** | Dialog/toast in CDK overlay — needs pass 2 |
| **Svelte** | Dialog/toast conditionally rendered — needs pass 2 |
| **Next.js** | Same as React (MUI) |
| **Lit (Shoelace)** | All content in Shadow DOM (pierced automatically); dialog conditionally rendered |

## Test Suite

```bash
# Unit tests (merge logic — no browser needed)
npx playwright test --config playwright.unit.config.ts

# Integration tests against vanilla app
npx playwright test --project=vanilla

# All 7 apps
npx playwright test
```

**Current: 626 passed, 18 skipped** (67 unit + 559 integration; skips are framework-appropriate dialog/toast expectations)

## Architecture

```
tools/crawler/
├── bin/pw-crawl.ts           # CLI entry point (crawl + generate subcommands)
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # Manifest types & schema
│   ├── discover.ts           # Group discovery (core algorithm)
│   ├── crawler.ts            # High-level crawl orchestration
│   ├── merge.ts              # Manifest merge & diff logic
│   ├── network.ts            # API dependency observation
│   ├── emitter.ts            # Page object emitter (manifest → TypeScript)
│   ├── emitter-types.ts      # Emitter type definitions
│   ├── emitter-diff.ts       # Page object diff / drift detection
│   └── naming.ts             # Label → camelCase property name conversion
├── tests/
│   ├── crawl.spec.ts         # Group discovery integration tests
│   ├── cross-app.spec.ts     # Cross-framework validation
│   ├── diff.spec.ts          # Manifest diff tests
│   ├── merge.spec.ts         # Merge logic unit tests
│   ├── emitter.spec.ts       # Emitter + template detection unit tests
│   └── naming.spec.ts        # Naming / route inference unit tests
├── playwright.config.ts
├── playwright.unit.config.ts
├── package.json
└── tsconfig.json
```
