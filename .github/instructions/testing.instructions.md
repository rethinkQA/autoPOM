---
description: "Testing conventions for Playwright test files. Use when writing or modifying .spec.ts test files."
applyTo: "**/*.spec.ts"
---

# Test Conventions

## Framework

All tests use `@playwright/test`. Framework integration tests import from `@playwright-elements/core/test-fixture` for automatic context isolation.

## File Naming

- Test files: `feature-name.spec.ts`
- Crawler unit tests: `tools/crawler/tests/*.spec.ts`
- Framework e2e tests: `framework/tests/*.spec.ts`
- Framework unit tests: `framework/tests/unit/*.spec.ts`

## Test Structure

```ts
test.describe("Feature — detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("action produces expected result", async ({ page }) => {
    // Arrange → Act → Assert
  });
});
```

## Naming

- `test.describe`: noun phrase or "Feature — detail" (`"Table — data, headers, sorting"`)
- `test`: present tense, action-focused (`"add to cart shows confirmation in action output"`)
- No `it` or `should` prefixes

## Assertions

- Use Playwright/Jest matchers: `expect(...).toBe()`, `.toEqual()`, `.toContain()`, `.toThrow()`
- For async element reads: `expect(await element.read()).toBe("value")`
- For polling: `await expect.poll(() => element.rowCount()).toBe(0)`
- For rejected promises: `await expect(promise).rejects.toThrow(/pattern/)`

## Patterns

- Create page objects inline or import from generated pages — don't duplicate element creation
- Use `captureTraffic(page, action)` for network assertions
- Set up `page.waitForResponse()` BEFORE the action that triggers the response
- `test.describe.configure({ mode: "serial" })` only when tests share mutable state
