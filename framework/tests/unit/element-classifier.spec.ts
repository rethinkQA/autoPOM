/**
 * Unit tests for the element classifier (`classifyElement`).
 *
 * These tests verify the two-phase detection algorithm:
 * - Phase 1: tag / role / attr / inputType matching via evaluate()
 * - Phase 2: requireChild verification via Playwright locator.count()
 *
 * Uses real DOM elements (via page.setContent) and real Locators.
 * Handler arrays are hand-crafted to isolate classification logic
 * from the full handler registry.
 */

import { test, expect } from "../../src/test-fixture.js";
import { classifyElement, type SerializedEntry } from "../../src/element-classifier.js";
import type { ElementHandler, DetectRule } from "../../src/handler-types.js";
import { NoHandlerMatchError } from "../../src/errors.js";

// ── Helpers ─────────────────────────────────────────────────

/** Minimal no-op handler factory for testing classification. */
function makeHandler(type: string, detect: DetectRule[]): ElementHandler {
  return {
    type,
    detect,
    set: async () => {},
    get: async () => "",
  };
}

/** Build serialized entries from a handler array (mirrors HandlerRegistry). */
function serialize(handlers: ElementHandler[]): SerializedEntry[] {
  return handlers.map((h, idx) => ({ idx, detect: h.detect }));
}

const silentLogger = { warn: () => {}, debug: () => {}, debugEnabled: false };

// ── Phase 1: Tag matching ───────────────────────────────────

test.describe("classifyElement — tag matching", () => {
  test("matches by tag name", async ({ page }) => {
    await page.setContent(`<select id="el"><option>A</option></select>`);
    const el = page.locator("#el");

    const selectHandler = makeHandler("select", [{ tags: ["select"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [selectHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("select");
  });

  test("matches textarea by tag", async ({ page }) => {
    await page.setContent(`<textarea id="el"></textarea>`);
    const el = page.locator("#el");

    const textareaHandler = makeHandler("textarea", [{ tags: ["textarea"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [textareaHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("textarea");
  });

  test("matches input tag with inputType filter", async ({ page }) => {
    await page.setContent(`<input type="checkbox" id="el" />`);
    const el = page.locator("#el");

    const checkboxHandler = makeHandler("checkbox", [
      { tags: ["input"], inputTypes: ["checkbox"] },
    ]);
    const textHandler = makeHandler("text-input", [
      { tags: ["input"], inputTypes: ["text"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxHandler, textHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("checkbox");
  });

  test("skips handler when inputType does not match", async ({ page }) => {
    await page.setContent(`<input type="text" id="el" />`);
    const el = page.locator("#el");

    const checkboxHandler = makeHandler("checkbox", [
      { tags: ["input"], inputTypes: ["checkbox"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    // checkbox handler should NOT match; fallback (input) should win
    expect(result.type).toBe("input");
  });
});

// ── Phase 1: Role matching ──────────────────────────────────

test.describe("classifyElement — role matching", () => {
  test("matches by ARIA role", async ({ page }) => {
    await page.setContent(`<div role="combobox" id="el">Pick</div>`);
    const el = page.locator("#el");

    const comboHandler = makeHandler("combobox", [{ roles: ["combobox"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [comboHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("combobox");
  });

  test("matches role='checkbox' on a non-input element", async ({ page }) => {
    await page.setContent(`<div role="checkbox" id="el" aria-checked="false">Toggle</div>`);
    const el = page.locator("#el");

    const checkboxHandler = makeHandler("checkbox", [
      { tags: ["input"], inputTypes: ["checkbox"] },
      { roles: ["checkbox"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("checkbox");
  });

  test("matches radiogroup role", async ({ page }) => {
    await page.setContent(`<div role="radiogroup" id="el"><div role="radio">A</div></div>`);
    const el = page.locator("#el");

    const radioGroupHandler = makeHandler("radiogroup", [{ roles: ["radiogroup"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [radioGroupHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("radiogroup");
  });
});

// ── Phase 1: Attr matching ──────────────────────────────────

test.describe("classifyElement — attribute matching", () => {
  test("matches by attribute name/value pair", async ({ page }) => {
    await page.setContent(`<div data-type="stepper" id="el">0</div>`);
    const el = page.locator("#el");

    const stepperHandler = makeHandler("stepper", [
      { attr: ["data-type", "stepper"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [stepperHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("stepper");
  });

  test("does not match when attribute value differs", async ({ page }) => {
    await page.setContent(`<div data-type="slider" id="el">0</div>`);
    const el = page.locator("#el");

    const stepperHandler = makeHandler("stepper", [
      { attr: ["data-type", "stepper"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [stepperHandler, fallback];

    await expect(
      classifyElement(el, handlers, serialize(handlers), fallback, silentLogger),
    ).rejects.toThrow(NoHandlerMatchError);
  });
});

// ── Phase 2: requireChild ───────────────────────────────────

test.describe("classifyElement — requireChild (Phase 2)", () => {
  test("matches when requireChild selector finds a child", async ({ page }) => {
    await page.setContent(`
      <fieldset id="el">
        <legend>Shipping</legend>
        <input type="radio" name="ship" /> Standard
        <input type="radio" name="ship" /> Express
      </fieldset>
    `);
    const el = page.locator("#el");

    const radioGroupHandler = makeHandler("radiogroup", [
      { tags: ["fieldset"], requireChild: "input[type='radio']" },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [radioGroupHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("radiogroup");
  });

  test("does not match when requireChild selector finds no children", async ({ page }) => {
    await page.setContent(`
      <fieldset id="el">
        <legend>Shipping</legend>
        <select><option>Standard</option></select>
      </fieldset>
    `);
    const el = page.locator("#el");

    const radioGroupHandler = makeHandler("radiogroup", [
      { tags: ["fieldset"], requireChild: "input[type='radio']" },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [radioGroupHandler, fallback];

    // fieldset matches the tag, but requireChild fails — should throw
    await expect(
      classifyElement(el, handlers, serialize(handlers), fallback, silentLogger),
    ).rejects.toThrow(NoHandlerMatchError);
  });
});

// ── Priority ordering ───────────────────────────────────────

test.describe("classifyElement — priority ordering", () => {
  test("first matching handler wins (lowest index)", async ({ page }) => {
    await page.setContent(`<div role="checkbox" id="el">Toggle</div>`);
    const el = page.locator("#el");

    const checkboxHandler = makeHandler("checkbox", [{ roles: ["checkbox"] }]);
    const switchHandler = makeHandler("switch", [{ roles: ["checkbox"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxHandler, switchHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("checkbox");
  });

  test("higher-priority requireChild handler beats lower-priority direct match", async ({ page }) => {
    await page.setContent(`
      <fieldset id="el">
        <legend>Options</legend>
        <input type="checkbox" /> Option A
        <input type="checkbox" /> Option B
      </fieldset>
    `);
    const el = page.locator("#el");

    // checkboxgroup has requireChild and is at index 0
    const checkboxGroupHandler = makeHandler("checkboxgroup", [
      { tags: ["fieldset"], requireChild: "input[type='checkbox']" },
    ]);
    // generic fieldset handler at index 1 (direct match, no requireChild)
    const fieldsetHandler = makeHandler("fieldset", [{ tags: ["fieldset"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxGroupHandler, fieldsetHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("checkboxgroup");
  });

  test("direct match at lower index beats requireChild at higher index", async ({ page }) => {
    await page.setContent(`
      <fieldset id="el">
        <legend>Options</legend>
        <input type="checkbox" /> Option A
      </fieldset>
    `);
    const el = page.locator("#el");

    // fieldset handler at index 0 (direct match)
    const fieldsetHandler = makeHandler("fieldset", [{ tags: ["fieldset"] }]);
    // checkboxgroup at index 1 (requireChild) — should be filtered out
    const checkboxGroupHandler = makeHandler("checkboxgroup", [
      { tags: ["fieldset"], requireChild: "input[type='checkbox']" },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [fieldsetHandler, checkboxGroupHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("fieldset");
  });
});

// ── NoHandlerMatchError ─────────────────────────────────────

test.describe("classifyElement — no match", () => {
  test("throws NoHandlerMatchError when no handler matches", async ({ page }) => {
    await page.setContent(`<div id="el">Hello</div>`);
    const el = page.locator("#el");

    const selectHandler = makeHandler("select", [{ tags: ["select"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [selectHandler, fallback];

    await expect(
      classifyElement(el, handlers, serialize(handlers), fallback, silentLogger),
    ).rejects.toThrow(NoHandlerMatchError);
  });

  test("NoHandlerMatchError includes tag info", async ({ page }) => {
    await page.setContent(`<span id="el">Text</span>`);
    const el = page.locator("#el");

    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [fallback];

    try {
      await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
      expect(true).toBe(false); // should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(NoHandlerMatchError);
      expect((e as NoHandlerMatchError).message).toContain("<span>");
    }
  });

  test("NoHandlerMatchError includes role info when present", async ({ page }) => {
    await page.setContent(`<div role="slider" id="el">50</div>`);
    const el = page.locator("#el");

    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [fallback];

    try {
      await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(NoHandlerMatchError);
      expect((e as NoHandlerMatchError).message).toContain('role="slider"');
    }
  });
});

// ── Fallback option ─────────────────────────────────────────

test.describe("classifyElement — fallback option", () => {
  test("returns fallback handler instead of throwing when fallback: true", async ({ page }) => {
    await page.setContent(`<div id="el">Hello</div>`);
    const el = page.locator("#el");

    const selectHandler = makeHandler("select", [{ tags: ["select"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [selectHandler, fallback];

    const result = await classifyElement(
      el, handlers, serialize(handlers), fallback, silentLogger, { fallback: true },
    );
    expect(result.type).toBe("input");
  });

  test("still returns correct handler even with fallback: true", async ({ page }) => {
    await page.setContent(`<select id="el"><option>A</option></select>`);
    const el = page.locator("#el");

    const selectHandler = makeHandler("select", [{ tags: ["select"] }]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [selectHandler, fallback];

    const result = await classifyElement(
      el, handlers, serialize(handlers), fallback, silentLogger, { fallback: true },
    );
    expect(result.type).toBe("select");
  });
});

// ── Multiple detect rules per handler ───────────────────────

test.describe("classifyElement — multiple detect rules", () => {
  test("matches on first applicable detect rule", async ({ page }) => {
    await page.setContent(`<div role="switch" id="el" aria-checked="false">Toggle</div>`);
    const el = page.locator("#el");

    const switchHandler = makeHandler("switch", [
      { tags: ["input"], inputTypes: ["checkbox"], attr: ["role", "switch"] },
      { roles: ["switch"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [switchHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("switch");
  });

  test("matches checkbox handler via role when tag is not input", async ({ page }) => {
    await page.setContent(`<span role="checkbox" id="el" aria-checked="true">✓</span>`);
    const el = page.locator("#el");

    const checkboxHandler = makeHandler("checkbox", [
      { tags: ["input"], inputTypes: ["checkbox"] },
      { roles: ["checkbox"] },
    ]);
    const fallback = makeHandler("input", [{ tags: ["input"] }]);
    const handlers = [checkboxHandler, fallback];

    const result = await classifyElement(el, handlers, serialize(handlers), fallback, silentLogger);
    expect(result.type).toBe("checkbox");
  });
});
