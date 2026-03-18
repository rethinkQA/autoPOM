import { test, expect } from "../../src/test-fixture.js";
import { select } from "../../src/elements/select.js";
import { By } from "../../src/by.js";
import type { SelectAdapter } from "../../src/elements/select-adapter.js";
import { nativeSelectAdapter } from "../../src/elements/select-adapter.js";
import { genericNonEditableSelectAdapter } from "../../src/adapters/generic-select-adapter.js";

/**
 * Unit tests for SelectAdapter injection into the select() element.
 *
 * Mirrors the date-picker-adapter.spec.ts pattern — verifies that
 * select() delegates choose() and read() to the provided adapter.
 */
test.describe("select custom adapter", () => {
  test("choose() delegates to custom adapter with correct arguments", async ({ page }) => {
    await page.setContent(`<select id="sel"><option>A</option><option>B</option></select>`);

    const calls: Array<{ method: string; value?: string }> = [];
    const mockAdapter: SelectAdapter = {
      async select(_el, value) {
        calls.push({ method: "select", value });
      },
      async read() {
        return "";
      },
    };

    const sel = select(By.css("#sel"), page, { adapter: mockAdapter });
    await sel.choose("B");

    expect(calls).toEqual([{ method: "select", value: "B" }]);
  });

  test("read() delegates to custom adapter and returns its value", async ({ page }) => {
    await page.setContent(`<select id="sel"><option>X</option></select>`);

    const mockAdapter: SelectAdapter = {
      async select() {},
      async read() {
        return "CustomValue";
      },
    };

    const sel = select(By.css("#sel"), page, { adapter: mockAdapter });
    const value = await sel.read();
    expect(value).toBe("CustomValue");
  });

  test("adapter receives the resolved locator element", async ({ page }) => {
    await page.setContent(`<select id="sel"><option value="a">Alpha</option></select>`);

    let receivedLocator = false;
    const mockAdapter: SelectAdapter = {
      async select(el) {
        const tag = await el.evaluate((node) => node.tagName.toLowerCase());
        receivedLocator = tag === "select";
      },
      async read(el) {
        const tag = await el.evaluate((node) => node.tagName.toLowerCase());
        return tag;
      },
    };

    const sel = select(By.css("#sel"), page, { adapter: mockAdapter });
    await sel.choose("Alpha");
    expect(receivedLocator).toBe(true);

    const value = await sel.read();
    expect(value).toBe("select");
  });

  test("default adapter is used when no custom adapter is provided", async ({ page }) => {
    await page.setContent(`
      <select id="sel">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>
    `);

    // No adapter option — falls back to nativeSelectAdapter
    const sel = select(By.css("#sel"), page);
    await sel.choose("Beta");
    const value = await sel.read();
    expect(value).toBe("Beta");
  });
});

test.describe("nativeSelectAdapter", () => {
  test("select delegates to selectOption", async ({ page }) => {
    await page.setContent(`
      <select id="sel">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>
    `);

    const locator = page.locator("#sel");
    await nativeSelectAdapter.select(locator, "Beta");

    const selected = await locator.inputValue();
    expect(selected).toBe("b");
  });

  test("read returns selected option text", async ({ page }) => {
    await page.setContent(`
      <select id="sel">
        <option value="a">Alpha</option>
        <option value="b" selected>Beta</option>
      </select>
    `);

    const locator = page.locator("#sel");
    const value = await nativeSelectAdapter.read(locator);
    expect(value).toBe("Beta");
  });
});

test.describe("comboboxSet editable vs non-editable detection", () => {
  test("editable combobox (input) uses fill path", async ({ page }) => {
    // Editable combobox — standard <input> with role="combobox"
    await page.setContent(`
      <div>
        <input id="combo" role="combobox" aria-controls="listbox1" />
        <ul id="listbox1" role="listbox">
          <li role="option">Apple</li>
          <li role="option">Banana</li>
        </ul>
      </div>
    `);

    const input = page.locator("#combo");
    // Import the handler to test directly
    const { getDefaultHandlerByType } = await import("../../src/default-handlers.js");
    const comboboxHandler = getDefaultHandlerByType("combobox");

    await comboboxHandler.set(input, "Apple");

    // The input should have been filled and the option clicked
    // (or at minimum, the fill path was used — input has a value)
    const value = await input.inputValue();
    expect(value).toBeTruthy();
  });

  test("non-editable combobox (div) uses click-to-open path", async ({ page }) => {
    // Non-editable combobox — <div> with role="combobox"
    await page.setContent(`
      <div>
        <div id="combo" role="combobox" tabindex="0"
             aria-controls="listbox2" aria-expanded="false">
          Select...
        </div>
        <ul id="listbox2" role="listbox" style="display:none;">
          <li role="option">Cherry</li>
          <li role="option">Date</li>
        </ul>
      </div>
      <script>
        const trigger = document.getElementById("combo");
        const listbox = document.getElementById("listbox2");
        trigger.addEventListener("click", () => {
          const expanded = trigger.getAttribute("aria-expanded") === "true";
          trigger.setAttribute("aria-expanded", String(!expanded));
          listbox.style.display = expanded ? "none" : "block";
        });
        listbox.addEventListener("click", (e) => {
          if (e.target.getAttribute("role") === "option") {
            trigger.textContent = e.target.textContent;
            trigger.setAttribute("aria-expanded", "false");
            listbox.style.display = "none";
          }
        });
      </script>
    `);

    const combo = page.locator("#combo");
    const { getDefaultHandlerByType } = await import("../../src/default-handlers.js");
    const comboboxHandler = getDefaultHandlerByType("combobox");

    // This should click the trigger, then click the option — NOT try fill()
    await comboboxHandler.set(combo, "Cherry");

    // Verify the selection was made
    await expect(combo).toHaveText("Cherry");
  });

  test("non-editable combobox get returns text content", async ({ page }) => {
    await page.setContent(`
      <div id="combo" role="combobox" tabindex="0">Selected Value</div>
    `);

    const combo = page.locator("#combo");
    const { getDefaultHandlerByType } = await import("../../src/default-handlers.js");
    const comboboxHandler = getDefaultHandlerByType("combobox");

    const value = await comboboxHandler.get(combo);
    expect(value).toBe("Selected Value");
  });

  test("editable combobox get returns input value", async ({ page }) => {
    await page.setContent(`
      <input id="combo" role="combobox" value="TypedText" />
    `);

    const combo = page.locator("#combo");
    const { getDefaultHandlerByType } = await import("../../src/default-handlers.js");
    const comboboxHandler = getDefaultHandlerByType("combobox");

    const value = await comboboxHandler.get(combo);
    expect(value).toBe("TypedText");
  });
});
