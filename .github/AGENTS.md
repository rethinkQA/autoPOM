# Project Guidelines

## Overview

Monorepo for `@playwright-elements/core` — a label-first, auto-detecting element interaction library for Playwright — plus a runtime page crawler that generates page objects from live apps.

See [docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md) for setup and [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md) for full requirements.

## Repository Structure

```
framework/       ← @playwright-elements/core library
tools/crawler/   ← @playwright-elements/crawler CLI (pw-crawl)
apps/            ← 7 minimal test-target web apps (vanilla, react, vue, angular, svelte, nextjs, lit)
shared/          ← Shared TypeScript data & logic
docs/            ← Requirements, roadmap, contributing
```

## Build & Test Commands

```bash
# Framework
cd framework && npm run build          # TypeScript → dist/
cd framework && npm run test:unit      # Unit tests (playwright.unit.config.ts)
cd framework && npm run test           # E2E tests against vanilla app
cd framework && npm run test:all       # E2E tests against all 7 apps
cd framework && npm run lint           # ESLint
cd framework && npm run format:check   # Prettier check

# Crawler
cd tools/crawler && npm run build
cd tools/crawler && npm test           # Unit tests

# All apps
npm run install:all                    # Install all dependencies
npm run start:all                      # Start all 7 apps concurrently
```

## Code Style

- **Formatting**: Prettier — `printWidth: 100`, `trailingComma: "all"`, double quotes, semicolons
- **Linting**: ESLint 10 + `@typescript-eslint` — strict mode, unused vars warn (`_` prefix ignored)
- **TypeScript**: `strict: true`, target `ES2022`, module `ESNext`
- **ES Modules**: All imports use relative paths with `.js` extension
- **Separate type imports**: `import type { X } from "./file.js"` for type-only imports
- **Explicit return types** on all exported functions and public methods
- **Naming**: PascalCase classes, camelCase functions, `UPPER_SNAKE_CASE` constants, `_underscore` private fields, `I` prefix for contract interfaces (`IFrameworkContext`)
- **Error handling**: Custom error classes extending `Error` with structured context objects
- **Documentation**: JSDoc on public APIs; section markers `// ── Name ───────────────`

## Architecture Principles

- No external runtime dependencies — only `@playwright/test` as peer dependency
- Dependency inversion via interfaces (`IFrameworkContext`, `IHandlerRegistry`, etc.)
- Factory functions for element creation (`group()`, `table()`, `checkbox()`, etc.)
- Classes for domain models and registries; functions for utilities and pure logic
- `AsyncLocalStorage` for per-test context isolation
- Frozen objects for immutable configuration (handlers, detect rules)

## Workflow Preferences

- Run relevant unit tests after making changes — don't wait to be asked
- When modifying framework code, build before testing: `npm run build && npm test`
- Prefer editing existing files over creating new ones
- Don't add abstractions for one-time operations
- Don't add docstrings or type annotations to unchanged code
- Link to existing docs rather than duplicating content
