/**
 * Slice 6C — verify the discover pass classifies typed elements (select,
 * input[type=number/date], spinbutton role) with the matching wrapperType,
 * and that they survive the nested-group filter when wrapped in a parent
 * <form>/<fieldset>.
 */

import { test, expect } from "@playwright/test";
import { discoverGroups, discoverTypedElements } from "../../src/discover.js";
import type { ManifestGroup } from "../../src/types.js";

const BASE = "http://localhost:9999";

function findBy(groups: ManifestGroup[], predicate: (g: ManifestGroup) => boolean): ManifestGroup | undefined {
  return groups.find(predicate);
}

test.describe("discoverGroups — typed-element classification", () => {
  test("classifies <select> as wrapperType=select even when nested in a <form>", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <form aria-label="Profile">
            <label for="country">Country</label>
            <select id="country" name="country">
              <option value="us">USA</option>
              <option value="ca">Canada</option>
            </select>
          </form>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const groups = await discoverGroups(page);

    const select = findBy(groups, (g) => g.selector.startsWith("select") || g.selector.includes("country"));
    expect(select).toBeDefined();
    expect(select!.wrapperType).toBe("select");

    // Parent form is also discovered — the select doesn't replace it.
    const form = findBy(groups, (g) => g.selector === "form" || g.selector.startsWith("form"));
    expect(form).toBeDefined();
  });

  test("classifies <input type='number'> as stepper", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <form aria-label="Cart">
            <label for="qty">Quantity</label>
            <input id="qty" name="qty" type="number" min="1" max="10" value="1" />
          </form>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const groups = await discoverGroups(page);

    const stepper = findBy(groups, (g) => g.selector.includes("qty") || g.selector.startsWith("input"));
    expect(stepper).toBeDefined();
    expect(stepper!.wrapperType).toBe("stepper");
  });

  test("classifies <input type='date'> as datePicker", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <form aria-label="Booking">
            <label for="date">Travel date</label>
            <input id="date" name="date" type="date" />
          </form>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const groups = await discoverGroups(page);

    const datePicker = findBy(groups, (g) => g.selector.includes("date") || g.selector.startsWith("input"));
    expect(datePicker).toBeDefined();
    expect(datePicker!.wrapperType).toBe("datePicker");
  });

  test("classifies role='spinbutton' as stepper", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div role="spinbutton" aria-label="Servings" aria-valuenow="1" aria-valuemin="1" aria-valuemax="10" tabindex="0">1</div>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const groups = await discoverGroups(page);

    const spinbutton = findBy(groups, (g) => g.label === "Servings");
    expect(spinbutton).toBeDefined();
    expect(spinbutton!.wrapperType).toBe("stepper");
  });

  test("discoverTypedElements returns ONLY typed wrappers, no group/dialog/table noise", async ({ page }) => {
    // The AI-discovery path skips discoverGroups entirely. discoverTypedElements
    // is the safety net that surfaces select/stepper/datePicker regardless.
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <nav>nav stuff</nav>
          <form aria-label="Order">
            <select name="size"><option>S</option><option>M</option></select>
            <input name="qty" type="number" />
            <input name="when" type="date" />
          </form>
          <table><caption>X</caption><tr><td>1</td></tr></table>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const typed = await discoverTypedElements(page);

    const wrapperTypes = typed.map((g) => g.wrapperType).sort();
    expect(wrapperTypes).toEqual(["datePicker", "select", "stepper"]);
    // table is excluded — it's already covered by the primary discovery pass.
    expect(typed.find((g) => g.wrapperType === "table" as ManifestGroup["wrapperType"])).toBeUndefined();
  });

  test("Slice 8A — <select> label prefers data-test/name over default option text", async ({ page }) => {
    // Sauce Demo regression: the sort <select> had a default selected
    // option "Name (A to Z)", which became the label, which became the
    // property name `nameAToZ`. With Slice 8A, the data-test attribute
    // takes precedence and the property name stabilizes.
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <select class="product_sort_container" data-test="product_sort_container">
            <option value="az">Name (A to Z)</option>
            <option value="za">Name (Z to A)</option>
          </select>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const typed = await discoverTypedElements(page);

    const sortDropdown = typed.find((g) => g.wrapperType === "select");
    expect(sortDropdown).toBeDefined();
    expect(sortDropdown!.label).toBe("product_sort_container");
    // No more default-option-text labels.
    expect(sortDropdown!.label).not.toBe("Name (A to Z)");
  });

  test("Slice 8A — <input> label prefers <label for> over placeholder/name", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <label for="qty">Quantity to order</label>
          <input id="qty" name="quantity" placeholder="enter a number" type="number" />
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const typed = await discoverTypedElements(page);

    const stepper = typed.find((g) => g.wrapperType === "stepper");
    expect(stepper).toBeDefined();
    expect(stepper!.label).toBe("Quantity to order");
  });

  test("Slice 8A — wrapping <label> resolves correctly with input value stripped", async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <label>Travel date <input type="date" value="2026-01-01" /></label>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const typed = await discoverTypedElements(page);

    const datePicker = typed.find((g) => g.wrapperType === "datePicker");
    expect(datePicker).toBeDefined();
    expect(datePicker!.label).toBe("Travel date");
  });

  test("manifest entries do NOT leak internal `_labelSource` field (Slice 7 follow-up)", async ({ page }) => {
    // Regression: `_labelSource` was surviving JSON serialization for typed
    // elements because the typed-pass copied entries verbatim instead of
    // letting the AI-discovery pipeline rebuild them from scratch.
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <select name="size"><option>S</option></select>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);

    const typed = await discoverTypedElements(page);
    const groups = await discoverGroups(page);

    for (const g of [...typed, ...groups]) {
      for (const key of Object.keys(g)) {
        expect(key.startsWith("_")).toBe(false);
      }
    }
  });

  test("plain <input type='text'> is NOT classified as a typed wrapper (no over-extraction)", async ({ page }) => {
    // Plain text inputs stay as fields the framework resolves by label —
    // they should not surface as their own manifest entries.
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <form aria-label="Login">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
          </form>
        </body></html>`,
      });
    });

    await page.goto(`${BASE}/`);
    const groups = await discoverGroups(page);

    // Form is captured.
    const form = findBy(groups, (g) => g.label === "Login");
    expect(form).toBeDefined();

    // The email input is NOT captured as its own group (no input[type=email] in GROUP_SELECTOR).
    const emailGroup = findBy(groups, (g) => g.selector.includes("#email"));
    expect(emailGroup).toBeUndefined();
  });
});
