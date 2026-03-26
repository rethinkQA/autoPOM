import { test, expect } from "../src/test-fixture.js";
import { By } from "../src/index.js";

test.describe("By — identification strategies", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("By.label resolves by associated label text", async ({ page }) => {
    const loc = await By.label("Search Products").resolve(page);
    await expect(loc).toBeVisible();
    await loc.fill("test");
    expect(await loc.inputValue()).toBe("test");
  });

  test("By.role resolves by ARIA role and accessible name", async ({ page }) => {
    const loc = await By.role("button", { name: "Add to Cart" }).resolve(page);
    await expect(loc.first()).toBeVisible();
    await expect(loc.first()).toHaveText("Add to Cart");
  });

  test("By.css resolves by CSS selector", async ({ page }) => {
    const loc = await By.css(".action-output").resolve(page);
    await expect(loc).toBeAttached();
  });

  test("By.text resolves by visible text content", async ({ page }) => {
    const loc = await By.text("GeneralStore").resolve(page);
    await expect(loc.first()).toBeVisible();
  });

  test("By.text(RegExp) resolves by regex pattern", async ({ page }) => {
    const loc = await By.text(/GeneralStore/i).resolve(page);
    await expect(loc.first()).toBeVisible();
  });

  test("By.role resolves by ARIA role", async ({ page }) => {
    const loc = await By.role("table").resolve(page);
    await expect(loc).toBeVisible();
  });

  test("By.within resolves child scoped inside parent", async ({ page }) => {
    const loc = await By.within(
      By.css(".filter-bar"),
      By.label("Search Products"),
    ).resolve(page);
    await expect(loc).toBeVisible();
    // Verify it's actually the input inside the filter bar
    await loc.fill("scoped test");
    expect(await loc.inputValue()).toBe("scoped test");
  });

  test("By.any falls back through multiple strategies (DOM order)", async ({ page }) => {
    const loc = await By.any(
      By.css("#nonexistent-element"),
      By.text("Add to Cart"),
    ).resolve(page);
    await expect(loc).toBeVisible();
    await expect(loc).toHaveText("Add to Cart");
  });

  test("By.any resolves without throwing", async ({ page }) => {
    const by = By.any(By.css(".a"), By.css(".b"));
    const loc = await by.resolve(page);
    expect(loc).toBeDefined();
    // Locator exists but may match zero elements — verify it doesn't throw
    expect(await loc.count()).toBeGreaterThanOrEqual(0);
  });

  test("By.first resolves in strict priority order", async ({ page }) => {
    // Both Bys match different single elements.
    // By.first must return the first By's match (header h1),
    // not the second By's match (footer).
    const by = By.first(
      By.css("header h1"),
      By.css("footer"),
    );

    // Strict priority: resolve() checks counts in array order
    const loc = await by.resolve(page);
    await expect(loc).toBeVisible();
    await expect(loc).toContainText("GeneralStore");
    // Confirm it's the header, not the footer
    const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
    expect(tag).toBe("h1");
  });

  test("By.shadow() resolves inside Shadow DOM", async ({ page }) => {
    await page.setContent(`
      <my-host></my-host>
      <script>
        const host = document.querySelector('my-host');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span class="inner">Shadow content</span>';
      </script>
    `);
    const loc = await By.shadow("my-host", ".inner").resolve(page);
    await expect(loc).toBeVisible();
    await expect(loc).toHaveText("Shadow content");
  });

  test("By factories have descriptive toString()", () => {
    expect(String(By.label("Name"))).toBe('By.label("Name")');
    expect(String(By.css(".foo"))).toBe('By.css(".foo")');
    expect(String(By.role("button"))).toBe('By.role("button")');
    expect(String(By.role("button", { name: "OK" }))).toBe('By.role("button", { name: "OK" })');
    expect(String(By.text("hello"))).toBe('By.text("hello")');
    expect(String(By.shadow("host", "inner"))).toBe('By.shadow("host", "inner")');
    expect(String(By.within(By.css("a"), By.css("b")))).toBe('By.within(By.css("a"), By.css("b"))');
    expect(String(By.any(By.css("a"), By.css("b")))).toBe('By.any(By.css("a"), By.css("b"))');
    expect(String(By.first(By.css("a"), By.css("b")))).toBe('By.first(By.css("a"), By.css("b"))');
  });
});
