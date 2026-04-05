/**
 * Tests for the captureTraffic() helper.
 *
 * Uses Playwright route interception to simulate API responses
 * and verifies that captureTraffic collects and reports them correctly.
 */

import { test, expect } from "../../src/test-fixture.js";
import { captureTraffic } from "../../src/capture-traffic.js";

test.describe("captureTraffic", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("http://localhost:9999/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>test</body></html>",
      });
    });
    await page.goto("http://localhost:9999/");
  });

  test("captures a single API call during an action", async ({ page }) => {
    await page.route("**/api/save", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      }));
    }, { idleTime: 100 });

    expect(traffic.requests).toHaveLength(1);
    expect(traffic.requests[0].method).toBe("POST");
    expect(traffic.requests[0].url).toContain("/api/save");
    expect(traffic.requests[0].responseStatus).toBe(200);
    expect(traffic.requests[0].requestBody).toEqual({ name: "test" });
    expect(traffic.requests[0].responseBody).toEqual({ ok: true });
    expect(traffic.requests[0].failed).toBe(false);
  });

  test("captures multiple API calls during an action", async ({ page }) => {
    await page.route("**/api/devices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 1 }]),
      });
    });

    await page.route("**/api/audit", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ logged: true }),
      });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => {
        fetch("/api/devices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "A" }) });
        fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update" }) });
      });
    }, { idleTime: 100 });

    expect(traffic.requests).toHaveLength(2);
  });

  test("byUrl returns the matching request", async ({ page }) => {
    await page.route("**/api/items", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => fetch("/api/items"));
    }, { idleTime: 100 });

    const req = traffic.byUrl("/api/items");
    expect(req.method).toBe("GET");
    expect(req.responseStatus).toBe(200);
  });

  test("byUrl throws when no match found", async ({ page }) => {
    const traffic = await captureTraffic(page, async () => {
      // no requests made
    }, { idleTime: 100 });

    expect(() => traffic.byUrl("/api/nothing")).toThrow(/No captured request/);
  });

  test("byMethodAndUrl returns the correct match", async ({ page }) => {
    await page.route("**/api/data", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: '{"get": true}' });
      } else {
        await route.fulfill({ status: 201, contentType: "application/json", body: '{"post": true}' });
      }
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => {
        fetch("/api/data");
        fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"x":1}' });
      });
    }, { idleTime: 100 });

    expect(traffic.byMethodAndUrl("GET", "/api/data").responseBody).toEqual({ get: true });
    expect(traffic.byMethodAndUrl("POST", "/api/data").responseBody).toEqual({ post: true });
  });

  test("allByUrl returns all matching requests", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/log", async (route) => {
      callCount++;
      await route.fulfill({ status: 200, body: String(callCount) });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(async () => {
        await fetch("/api/log");
        await fetch("/api/log");
      });
    }, { idleTime: 100 });

    expect(traffic.allByUrl("/api/log")).toHaveLength(2);
  });

  test("ignores static resources", async ({ page }) => {
    await page.route("**/api/real", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => {
        fetch("/api/real");
        // These would be filtered as static resources if they happened
      });
    }, { idleTime: 100 });

    // Only the API call should be captured, not any page resources
    const apiCalls = traffic.allByUrl("/api/real");
    expect(apiCalls).toHaveLength(1);
  });

  test("respects ignore patterns", async ({ page }) => {
    await page.route("**/api/track", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });
    await page.route("**/api/real", async (route) => {
      await route.fulfill({ status: 200, body: "ok" });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => {
        fetch("/api/track");
        fetch("/api/real");
      });
    }, { idleTime: 100, ignore: ["/api/track"] });

    expect(traffic.requests).toHaveLength(1);
    expect(traffic.requests[0].url).toContain("/api/real");
  });

  test("returns empty result when no API calls occur", async ({ page }) => {
    const traffic = await captureTraffic(page, async () => {
      // Just a DOM operation, no network
      await page.evaluate(() => {
        document.title = "changed";
      });
    }, { idleTime: 100 });

    expect(traffic.requests).toHaveLength(0);
  });

  test("captures failed requests", async ({ page }) => {
    await page.route("**/api/fail", async (route) => {
      await route.abort("connectionrefused");
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() =>
        fetch("/api/fail").then(() => {}, () => {}),
      );
    }, { idleTime: 100 });

    expect(traffic.requests).toHaveLength(1);
    expect(traffic.requests[0].failed).toBe(true);
    expect(traffic.requests[0].responseStatus).toBe(0);
  });

  test("records duration for requests", async ({ page }) => {
    await page.route("**/api/slow", async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.fulfill({ status: 200, body: "ok" });
    });

    const traffic = await captureTraffic(page, async () => {
      await page.evaluate(() => fetch("/api/slow"));
    }, { idleTime: 100 });

    expect(traffic.requests).toHaveLength(1);
    expect(traffic.requests[0].duration).toBeGreaterThanOrEqual(50);
  });
});
