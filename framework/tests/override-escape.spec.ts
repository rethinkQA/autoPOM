import { test, expect } from "../src/test-fixture.js";
import { By, checkbox, select, textInput, button, text } from "../src/index.js";
import { homePage } from "./pages/home.js";

test.describe("Override — direct element wrapper usage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("checkbox wrapper directly bypasses group.write()", async ({ page }) => {
    // Some component libraries (e.g. Shoelace) render checkboxes inside
    // nested shadow DOM where getByLabel cannot resolve the <input>.
    // In those cases, skip — this test only validates direct wrapper access.
    const labelLocator = page.getByLabel("Show only in-stock items");
    test.skip((await labelLocator.count()) === 0,
      "Component library app — native checkbox not accessible via getByLabel");
    const cb = checkbox(By.label("Show only in-stock items"), page);
    await cb.check();
    expect(await cb.isChecked()).toBe(true);
    // Verify it actually filtered the table
    const home = homePage(page);
    expect(await home.productTable.rowCount()).toBe(5);
  });

  test("select wrapper directly bypasses group.write()", async ({ page }) => {
    // The select() wrapper targets native <select> elements.
    // Apps using component library selects (mat-select, MUI Select, etc.)
    // render role="combobox" instead — skip those.
    const nativeSelect = page.locator(".filter-bar select:not([hidden])").first();
    const isVisible = (await nativeSelect.count()) > 0
      && await nativeSelect.isVisible().catch(() => false);
    test.skip(!isVisible,
      "Component library app — no visible native <select> in filter bar");
    const sel = select(By.css(".filter-bar select"), page);
    await sel.choose("Books");
    expect(await sel.read()).toBe("Books");
    const options = await sel.options();
    expect(options).toEqual(["All", "Electronics", "Books", "Clothing"]);
  });

  test("textInput wrapper for direct input access", async ({ page }) => {
    const input = textInput(By.label("Search Products"), page);
    await input.fill("keyboard");
    expect(await input.read()).toBe("keyboard");
    const home = homePage(page);
    expect(await home.productTable.rowCount()).toBe(1);
  });

  test("textInput.clear() empties the input", async ({ page }) => {
    const input = textInput(By.label("Search Products"), page);
    await input.fill("test");
    expect(await input.read()).toBe("test");
    await input.clear();
    expect(await input.read()).toBe("");
  });

  test("button wrapper directly", async ({ page }) => {
    const btn = button(By.css(".action-area button"), page);
    await btn.click();
    const output = text(By.css(".action-output"), page);
    expect(await output.read()).toContain("Added");
  });

  test("raw locator access on table", async ({ page }) => {
    const home = homePage(page);
    const rawRow = (await home.productTable.locator()).locator("tbody tr").nth(0);
    const cells = await rawRow.locator("td").allTextContents();
    expect(cells[0]).toContain("Wireless Mouse");
  });
});
