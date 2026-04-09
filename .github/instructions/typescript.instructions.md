---
description: "TypeScript conventions for the @playwright-elements monorepo. Use when writing or modifying TypeScript source files."
applyTo: ["**/*.ts", "!**/*.spec.ts"]
---

# TypeScript Conventions

## Imports

```ts
// Type-only imports separated
import type { Page, Locator } from "@playwright/test";
import { By, group, table } from "@playwright-elements/core";

// Relative paths always use .js extension (ESM)
import { NetworkObserver } from "./network.js";
import type { CrawlerManifest } from "./types.js";
```

## Return Types

All exported functions and public methods must have explicit return types:

```ts
export function inferRouteName(route: string): string { ... }
async resolve(scope: Scope): Promise<Locator> { ... }
```

## Naming

| Kind | Convention | Example |
|------|-----------|---------|
| Class | PascalCase | `HandlerRegistry`, `NetworkObserver` |
| Function | camelCase | `selectorToByExpression`, `crawlPage` |
| Constant | UPPER_SNAKE_CASE | `NETWORK_IDLE_TIME_MS`, `ROLE_PRIORITY` |
| Interface (contract) | `I` prefix | `IFrameworkContext`, `IHandlerRegistry` |
| Private field | `_` prefix | `_handlers`, `_started` |
| Type / non-contract interface | PascalCase | `ActionNavigation`, `TableAdapter` |

## Error Handling

Use custom error classes with structured context at system boundaries:

```ts
throw new ElementNotFoundError(
  `No element found with label "${label}"`,
  { query: label, triedStrategies, container },
);
```

Use `RangeError` for invalid arguments. Standard `Error` for general failures.

## Documentation

- JSDoc on all public APIs (exported classes, interfaces, functions)
- Section comment markers: `// ── Section Name ───────────────────────`
- Cross-reference issues: `// P2-251: explanation`
- Don't add JSDoc to internal helper functions or unchanged code

## Patterns

- Classes for domain models and stateful registries
- Functions for factories, utilities, and pure logic
- `Object.freeze()` on immutable configuration objects
- Interface-based contracts for dependency inversion
- `AsyncLocalStorage` for per-test context isolation
