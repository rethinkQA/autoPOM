import { test, expect } from "../../src/test-fixture.js";
import { clickInContainer } from "../../src/dom-helpers.js";

/**
 * Unit tests for clickInContainer() — exercises the button → link → text
 * priority chain using Playwright's built-in page rendering.
 */
test.describe("clickInContainer", () => {
  test("clicks a button when present", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <button id="btn">Click Me</button>
      </div>
    `);
    const container = page.locator("#container");
    await page.evaluate(() => {
      document.getElementById("btn")!.addEventListener("click", () => {
        document.getElementById("btn")!.textContent = "Clicked!";
      });
    });
    await clickInContainer(container, "Click Me");
    await expect(page.locator("#btn")).toHaveText("Clicked!");
  });

  test("falls back to link when no button matches", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <a id="lnk" href="#">Go Home</a>
      </div>
    `);
    const container = page.locator("#container");
    await page.evaluate(() => {
      document.getElementById("lnk")!.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("lnk")!.textContent = "Navigated!";
      });
    });
    await clickInContainer(container, "Go Home");
    await expect(page.locator("#lnk")).toHaveText("Navigated!");
  });

  test("falls back to text when no button or link matches", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <span id="txt">Some Text</span>
      </div>
    `);
    const container = page.locator("#container");
    await page.evaluate(() => {
      document.getElementById("txt")!.addEventListener("click", () => {
        document.getElementById("txt")!.textContent = "Clicked text!";
      });
    });
    await clickInContainer(container, "Some Text");
    await expect(page.locator("#txt")).toHaveText("Clicked text!");
  });

  test("button takes priority over link with same text", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <a id="lnk" href="#">Action</a>
        <button id="btn">Action</button>
      </div>
    `);
    const container = page.locator("#container");
    await page.evaluate(() => {
      document.getElementById("btn")!.addEventListener("click", () => {
        document.getElementById("btn")!.dataset.clicked = "true";
      });
      document.getElementById("lnk")!.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("lnk")!.dataset.clicked = "true";
      });
    });
    await clickInContainer(container, "Action");
    expect(await page.locator("#btn").getAttribute("data-clicked")).toBe("true");
    expect(await page.locator("#lnk").getAttribute("data-clicked")).toBeNull();
  });

  test("link takes priority over plain text with same content", async ({ page }) => {
    await page.setContent(`
      <div id="container">
        <span id="txt">Details</span>
        <a id="lnk" href="#">Details</a>
      </div>
    `);
    const container = page.locator("#container");
    await page.evaluate(() => {
      document.getElementById("lnk")!.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("lnk")!.dataset.clicked = "true";
      });
      document.getElementById("txt")!.addEventListener("click", () => {
        document.getElementById("txt")!.dataset.clicked = "true";
      });
    });
    await clickInContainer(container, "Details");
    expect(await page.locator("#lnk").getAttribute("data-clicked")).toBe("true");
    expect(await page.locator("#txt").getAttribute("data-clicked")).toBeNull();
  });

  test("throws for empty text", async ({ page }) => {
    await page.setContent(`<div id="container"><button>OK</button></div>`);
    const container = page.locator("#container");
    await expect(clickInContainer(container, "")).rejects.toThrow(
      "clickInContainer: text must be a non-empty string",
    );
  });

  test("throws for whitespace-only text", async ({ page }) => {
    await page.setContent(`<div id="container"><button>OK</button></div>`);
    const container = page.locator("#container");
    await expect(clickInContainer(container, "   ")).rejects.toThrow(
      "clickInContainer: text must be a non-empty string",
    );
  });
});
