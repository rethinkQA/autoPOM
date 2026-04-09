/**
 * Unit tests for label resolution (`label-resolution.ts`).
 *
 * Tests cover:
 * - normalizeRadioLabel() — em/en dash splitting, plain labels, hyphens
 * - resolveInputLabel() — aria-label, label[for], wrapping label, text content fallback
 * - readCheckedRadioLabel() — native :checked, aria-checked fallback
 * - resolveLabeled() — parallel batch resolution, discriminated union handling,
 *   empty label rejection, retry/timeout behaviour
 */

import { test, expect } from "../../src/test-fixture.js";
import {
  normalizeRadioLabel,
  normalizeLabel,
  buildNormalizedPattern,
  resolveInputLabel,
  readCheckedRadioLabel,
  resolveLabeled,
} from "../../src/label-resolution.js";
import { ElementNotFoundError } from "../../src/errors.js";

// ── normalizeRadioLabel ─────────────────────────────────────

test.describe("normalizeRadioLabel", () => {
  test("returns plain label unchanged", () => {
    expect(normalizeRadioLabel("Standard")).toBe("Standard");
  });

  test("trims whitespace", () => {
    expect(normalizeRadioLabel("  Express  ")).toBe("Express");
  });

  test("strips text after em dash (U+2014)", () => {
    expect(normalizeRadioLabel("Express — $9.99")).toBe("Express");
  });

  test("strips text after en dash (U+2013)", () => {
    expect(normalizeRadioLabel("Overnight – $19.99")).toBe("Overnight");
  });

  test("preserves regular hyphens in labels", () => {
    expect(normalizeRadioLabel("Pre-paid")).toBe("Pre-paid");
  });

  test("preserves hyphenated multi-word labels", () => {
    expect(normalizeRadioLabel("T-shirt")).toBe("T-shirt");
  });

  test("handles em dash at start (edge case)", () => {
    // "— Rest" → match[1] would be empty-ish; regex requires .+ so no match
    const result = normalizeRadioLabel("— Rest");
    expect(result).toBe("— Rest");
  });

  test("handles empty string", () => {
    expect(normalizeRadioLabel("")).toBe("");
  });

  test("handles label with multiple em dashes — keeps text before last dash", () => {
    // P2-220: greedy (.+) keeps everything before the *last* em/en dash.
    expect(normalizeRadioLabel("Express — fast — $9.99")).toBe("Express — fast");
  });
});

// ── normalizeLabel ──────────────────────────────────────────

test.describe("normalizeLabel", () => {
  test("returns null when already normalized", () => {
    expect(normalizeLabel("Search")).toBeNull();
  });

  test("trims leading/trailing whitespace", () => {
    expect(normalizeLabel("  Email  ")).toBe("Email");
  });

  test("collapses internal whitespace", () => {
    expect(normalizeLabel("First   Name")).toBe("First Name");
  });

  test("strips trailing colon", () => {
    expect(normalizeLabel("Email:")).toBe("Email");
  });

  test("strips trailing colon with surrounding whitespace", () => {
    expect(normalizeLabel(" First Name : ")).toBe("First Name");
  });

  test("applies all transformations together", () => {
    expect(normalizeLabel("  First   Name : ")).toBe("First Name");
  });

  test("returns null for already-clean label with no changes", () => {
    expect(normalizeLabel("Password")).toBeNull();
  });
});

// ── buildNormalizedPattern ───────────────────────────────────

test.describe("buildNormalizedPattern", () => {
  test("matches exact label", () => {
    const re = buildNormalizedPattern("Email");
    expect(re.test("Email")).toBe(true);
  });

  test("matches label with trailing colon", () => {
    const re = buildNormalizedPattern("Email");
    expect(re.test("Email:")).toBe(true);
  });

  test("matches label with leading/trailing whitespace", () => {
    const re = buildNormalizedPattern("Email");
    expect(re.test("  Email  ")).toBe(true);
  });

  test("matches label with colon and whitespace", () => {
    const re = buildNormalizedPattern("First Name");
    expect(re.test(" First Name : ")).toBe(true);
  });

  test("matches label with collapsed whitespace", () => {
    const re = buildNormalizedPattern("First Name");
    expect(re.test("First   Name")).toBe(true);
  });

  test("does not match different label", () => {
    const re = buildNormalizedPattern("Email");
    expect(re.test("Last Name")).toBe(false);
  });

  test("does not match substring", () => {
    const re = buildNormalizedPattern("Name");
    expect(re.test("Last Name")).toBe(false);
  });

  test("escapes regex special characters in label", () => {
    const re = buildNormalizedPattern("Search...");
    expect(re.test("Search...")).toBe(true);
    expect(re.test("SearchXYZ")).toBe(false);
  });
});

// ── resolveInputLabel ───────────────────────────────────────

test.describe("resolveInputLabel", () => {
  test("resolves from aria-label attribute", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <input id="el" type="radio" aria-label="Standard — Free" />
      </div>
    `);
    const input = page.locator("#el");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("Standard");
  });

  test("resolves from label[for] when no aria-label", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <input id="ship-express" type="radio" />
        <label for="ship-express">Express — $9.99</label>
      </div>
    `);
    const input = page.locator("#ship-express");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("Express");
  });

  test("resolves from wrapping label element", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <label>
          <input type="radio" id="el" />
          Overnight — $19.99
        </label>
      </div>
    `);
    const input = page.locator("#el");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("Overnight");
  });

  test("falls back to text content for ARIA role elements", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <div role="radio" id="el" aria-checked="false">Economy</div>
      </div>
    `);
    const input = page.locator("#el");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("Economy");
  });

  test("returns empty string when no label can be found", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <input type="radio" id="el" />
      </div>
    `);
    const input = page.locator("#el");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("");
  });

  test("prefers aria-label over label[for]", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <input id="el" type="radio" aria-label="Priority" />
        <label for="el">Regular</label>
      </div>
    `);
    const input = page.locator("#el");
    const container = page.locator("#container");

    const label = await resolveInputLabel(input, container);
    expect(label).toBe("Priority");
  });
});

// ── readCheckedRadioLabel ───────────────────────────────────

test.describe("readCheckedRadioLabel", () => {
  test("reads label of native checked radio", async ({ page }) => {
    await page.setContent(`
      <div id="group">
        <label><input type="radio" name="ship" value="std" /> Standard</label>
        <label><input type="radio" name="ship" value="exp" checked /> Express</label>
      </div>
    `);
    const container = page.locator("#group");

    const label = await readCheckedRadioLabel(container);
    expect(label).toBe("Express");
  });

  test("reads label of aria-checked radio when no native checked", async ({ page }) => {
    await page.setContent(`
      <div id="group" role="radiogroup">
        <div role="radio" aria-checked="false">Standard</div>
        <div role="radio" aria-checked="true">Overnight</div>
      </div>
    `);
    const container = page.locator("#group");

    const label = await readCheckedRadioLabel(container);
    expect(label).toBe("Overnight");
  });

  test("returns empty string when no radio is checked", async ({ page }) => {
    await page.setContent(`
      <div id="group">
        <label><input type="radio" name="ship" value="std" /> Standard</label>
        <label><input type="radio" name="ship" value="exp" /> Express</label>
      </div>
    `);
    const container = page.locator("#group");

    const label = await readCheckedRadioLabel(container);
    // P2-170: null means "no radio selected" (distinct from "" = unlabeled checked)
    expect(label).toBeNull();
  });

  test("prefers native :checked over aria-checked", async ({ page }) => {
    await page.setContent(`
      <div id="group">
        <label><input type="radio" name="ship" value="std" checked /> Standard</label>
        <div role="radio" aria-checked="true">Express</div>
      </div>
    `);
    const container = page.locator("#group");

    const label = await readCheckedRadioLabel(container);
    expect(label).toBe("Standard");
  });
});

// ── resolveLabeled ──────────────────────────────────────────

test.describe("resolveLabeled", () => {
  /**
   * Create a minimal framework context mock with real handler registry.
   * We import the real defaults to get a properly configured registry.
   */
  async function makeFwCtx() {
    const { FrameworkContext } = await import("../../src/context.js");
    return new FrameworkContext();
  }

  test("rejects empty label with synchronous error", async ({ page }) => {
    const ctx = await makeFwCtx();

    await expect(
      resolveLabeled(page.locator("body"), "", ctx),
    ).rejects.toThrow("label must be a non-empty string");
  });

  test("rejects whitespace-only label", async ({ page }) => {
    const ctx = await makeFwCtx();

    await expect(
      resolveLabeled(page.locator("body"), "   ", ctx),
    ).rejects.toThrow("label must be a non-empty string");
  });

  test("resolves a labeled text input via getByLabel", async ({ page }) => {
    await page.setContent(`
      <label for="search">Search</label>
      <input id="search" type="text" />
    `);
    const ctx = await makeFwCtx();

    const result = await resolveLabeled(page.locator("body"), "Search", ctx);
    expect(result.handler).toBeDefined();
    expect(result.handler.type).toBe("input");
    expect(result.el).toBeDefined();
  });

  test("resolves a select via getByLabel", async ({ page }) => {
    await page.setContent(`
      <label for="cat">Category</label>
      <select id="cat"><option>All</option><option>Food</option></select>
    `);
    const ctx = await makeFwCtx();

    const result = await resolveLabeled(page.locator("body"), "Category", ctx);
    expect(result.handler.type).toBe("select");
  });

  test("resolves a checkbox via getByLabel", async ({ page }) => {
    await page.setContent(`
      <label for="stock">Show only in-stock</label>
      <input id="stock" type="checkbox" />
    `);
    const ctx = await makeFwCtx();

    const result = await resolveLabeled(page.locator("body"), "Show only in-stock", ctx);
    expect(result.handler.type).toBe("checkbox");
  });

  test("resolves a radiogroup via getByRole fallback", async ({ page }) => {
    await page.setContent(`
      <fieldset>
        <legend>Shipping</legend>
        <label><input type="radio" name="ship" /> Standard</label>
        <label><input type="radio" name="ship" /> Express</label>
      </fieldset>
    `);
    const ctx = await makeFwCtx();

    const result = await resolveLabeled(page.locator("body"), "Shipping", ctx);
    // fieldset + legend = radiogroup or group depending on detect rules
    expect(result.handler).toBeDefined();
    expect(result.el).toBeDefined();
  });

  test("throws ElementNotFoundError for non-existent label", async ({ page }) => {
    await page.setContent(`<div>Empty page</div>`);
    const ctx = await makeFwCtx();

    await expect(
      resolveLabeled(page.locator("body"), "Nonexistent", ctx, 500),
    ).rejects.toThrow(ElementNotFoundError);
  });

  test("ElementNotFoundError includes label and strategies", async ({ page }) => {
    await page.setContent(`<div>Empty page</div>`);
    const ctx = await makeFwCtx();

    try {
      await resolveLabeled(page.locator("body"), "Missing Field", ctx, 500);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ElementNotFoundError);
      const msg = (e as Error).message;
      expect(msg).toContain("Missing Field");
      expect(msg).toContain("getByLabel");
      expect(msg).toContain("getByPlaceholder");
      expect(msg).toContain("getByRole");
    }
  });

  test("resolves an input via getByPlaceholder (Phase 1)", async ({ page }) => {
    await page.setContent(`
      <input type="password" placeholder="Password" />
    `);
    const ctx = await makeFwCtx();

    const result = await resolveLabeled(page.locator("body"), "Password", ctx);
    expect(result.handler.type).toBe("input");
  });

  test("getByLabel (exact) takes priority over getByPlaceholder", async ({ page }) => {
    await page.setContent(`
      <label for="pw">Password</label>
      <input id="pw" type="password" placeholder="Password" />
    `);
    const ctx = await makeFwCtx();

    // Should resolve via Phase 0 getByLabel, not Phase 1 getByPlaceholder
    const result = await resolveLabeled(page.locator("body"), "Password", ctx);
    expect(result.handler.type).toBe("input");
  });

  test("resolves via normalized label when exact fails (Phase 3)", async ({ page }) => {
    await page.setContent(`
      <label for="email">Email:</label>
      <input id="email" type="text" />
    `);
    const ctx = await makeFwCtx();

    // "Email" won't match "Email:" exactly, but normalized pass strips trailing colon
    const result = await resolveLabeled(page.locator("body"), "Email", ctx);
    expect(result.handler.type).toBe("input");
  });

  test("resolves via normalized placeholder (Phase 4)", async ({ page }) => {
    await page.setContent(`
      <input type="text" placeholder="Search :" />
    `);
    const ctx = await makeFwCtx();

    // "Search" won't match "Search :" exactly, but normalized regex tolerates colon
    const result = await resolveLabeled(page.locator("body"), "Search", ctx);
    expect(result.handler.type).toBe("input");
  });

  test("resolves radiogroup via normalized getByRole (Phase 5)", async ({ page }) => {
    await page.setContent(`
      <fieldset>
        <legend>Shipping:</legend>
        <label><input type="radio" name="ship" /> Standard</label>
        <label><input type="radio" name="ship" /> Express</label>
      </fieldset>
    `);
    const ctx = await makeFwCtx();

    // "Shipping" won't match "Shipping:" exactly, but normalized pass strips the colon
    const result = await resolveLabeled(page.locator("body"), "Shipping", ctx);
    expect(result.handler).toBeDefined();
    expect(result.el).toBeDefined();
  });
});

// ── Label strategies in resolveLabeled ──────────────────────

test.describe("resolveLabeled with label strategies", () => {
  async function makeFwCtx() {
    const { FrameworkContext } = await import("../../src/context.js");
    return new FrameworkContext();
  }

  test("resolves via a registered label strategy when getByLabel fails", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <label for="firstName">First Name</label>
        <span id="firstName">John</span>
      </div>
    `);
    const ctx = await makeFwCtx();

    // Register a strategy that resolves label[for] → any element (not just form controls)
    ctx.handlers.registerLabelStrategy({
      name: "label-for-id",
      async resolve(container, label) {
        const labelEl = container.locator(`label:text-is("${label}")`);
        if ((await labelEl.count()) === 0) return null;
        const forAttr = await labelEl.first().getAttribute("for");
        if (!forAttr) return null;
        const target = container.locator(`#${forAttr}`);
        return (await target.count()) > 0 ? target.first() : null;
      },
    });

    const result = await resolveLabeled(page.locator("#container"), "First Name", ctx);
    expect(result.handler).toBeDefined();
    expect(result.handler.type).toBe("text-display");
    const value = await result.handler.get(result.el);
    expect(value).toBe("John");
  });

  test("label strategy is not tried when getByLabel matches", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <label for="email">Email</label>
        <input id="email" type="text" value="test@example.com" />
      </div>
    `);
    const ctx = await makeFwCtx();

    let strategyCalled = false;
    ctx.handlers.registerLabelStrategy({
      name: "spy-strategy",
      async resolve() {
        strategyCalled = true;
        return null;
      },
    });

    // getByLabel should match the input at Phase 0 — strategy should NOT be called
    const result = await resolveLabeled(page.locator("#container"), "Email", ctx);
    expect(result.handler.type).toBe("input");
    expect(strategyCalled).toBe(false);
  });

  test("error message includes label strategy names", async ({ page }) => {
    await page.setContent(`<div>Empty page</div>`);
    const ctx = await makeFwCtx();

    ctx.handlers.registerLabelStrategy({
      name: "custom-lookup",
      async resolve() { return null; },
    });

    try {
      await resolveLabeled(page.locator("body"), "Nonexistent", ctx, 500);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ElementNotFoundError);
      const msg = (e as Error).message;
      expect(msg).toContain('labelStrategy("custom-lookup")');
    }
  });
});
