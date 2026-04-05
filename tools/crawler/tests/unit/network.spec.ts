/**
 * Unit tests for the NetworkObserver action attribution.
 */

import { test, expect } from "@playwright/test";
import { NetworkObserver } from "../../src/network.js";

const BASE = "http://localhost:9999";

// We need a real page for the observer since it hooks into Playwright events
test.describe("NetworkObserver attribution", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${BASE}/`, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>test</body></html>" });
    });
    await page.goto(`${BASE}/`);
  });

  test("attributes API calls to an action when setAction is used", async ({ page }) => {
    await page.route("**/api/save", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    const observer = new NetworkObserver(page);
    observer.start();

    // Simulate page-load traffic
    await page.evaluate(() => fetch("/api/save"));
    await page.waitForTimeout(100);

    // Now simulate an interaction
    const interactionTimestamp = Date.now();
    observer.setAction("click → Save button");
    await page.evaluate(() => fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"x":1}' }));
    await page.waitForTimeout(100);
    observer.clearAction();

    const deps = observer.stop(interactionTimestamp);

    // Should have both a page-load GET and an interaction PUT
    const pageLoadDeps = deps.filter((d) => d.timing === "page-load");
    const interactionDeps = deps.filter((d) => d.timing === "interaction");

    expect(pageLoadDeps.length).toBeGreaterThanOrEqual(1);
    expect(interactionDeps.length).toBeGreaterThanOrEqual(1);

    // The interaction dep should have triggeredBy
    const putDep = interactionDeps.find((d) => d.method === "PUT");
    expect(putDep).toBeDefined();
    expect(putDep!.triggeredBy).toBe("click → Save button");
  });

  test("page-load deps have no triggeredBy", async ({ page }) => {
    await page.route("**/api/data", async (route) => {
      await route.fulfill({ status: 200, body: "[]" });
    });

    const observer = new NetworkObserver(page);
    observer.start();

    await page.evaluate(() => fetch("/api/data"));
    await page.waitForTimeout(100);

    const deps = observer.stop();

    expect(deps).toHaveLength(1);
    expect(deps[0].triggeredBy).toBeUndefined();
  });

  test("multiple actions attribute to correct endpoints", async ({ page }) => {
    await page.route("**/api/delete", async (route) => {
      await route.fulfill({ status: 204, body: "" });
    });
    await page.route("**/api/refresh", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    const observer = new NetworkObserver(page);
    const interactionTimestamp = Date.now();
    observer.start();

    // First action
    observer.setAction("click → Delete");
    await page.evaluate(() => fetch("/api/delete", { method: "DELETE" }));
    await page.waitForTimeout(100);
    observer.clearAction();

    await page.waitForTimeout(50);

    // Second action
    observer.setAction("click → Refresh");
    await page.evaluate(() => fetch("/api/refresh"));
    await page.waitForTimeout(100);
    observer.clearAction();

    const deps = observer.stop(interactionTimestamp);

    const deleteDep = deps.find((d) => d.method === "DELETE");
    const refreshDep = deps.find((d) => d.pattern.includes("refresh"));

    expect(deleteDep?.triggeredBy).toBe("click → Delete");
    expect(refreshDep?.triggeredBy).toBe("click → Refresh");
  });

  test("clearAction resets state — subsequent calls have no attribution", async ({ page }) => {
    await page.route("**/api/a", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });
    await page.route("**/api/b", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });

    const observer = new NetworkObserver(page);
    const interactionTimestamp = Date.now();
    observer.start();

    observer.setAction("click → Button A");
    await page.evaluate(() => fetch("/api/a"));
    await page.waitForTimeout(100);
    observer.clearAction();

    // This call happens outside any action
    await page.waitForTimeout(2500);
    await page.evaluate(() => fetch("/api/b"));
    await page.waitForTimeout(100);

    const deps = observer.stop(interactionTimestamp);
    const depB = deps.find((d) => d.pattern.includes("/api/b"));

    // depB should be "interaction" timing but without triggeredBy
    // (it was outside the action window + the 2s grace)
    expect(depB).toBeDefined();
    expect(depB!.triggeredBy).toBeUndefined();
  });
});
