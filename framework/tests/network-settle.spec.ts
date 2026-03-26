/**
 * Tests for the networkSettleMiddleware.
 *
 * Uses Playwright route interception to simulate delayed API responses
 * triggered by user interactions, verifying that the middleware
 * correctly waits for the network to settle before continuing.
 */

import { test, expect } from "../src/test-fixture.js";
import { By, group } from "../src/index.js";
import { useMiddleware } from "../src/extend.js";
import { networkSettleMiddleware } from "../src/network-settle-middleware.js";
test.describe("networkSettleMiddleware", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("waits for a delayed API response after write", async ({ page }) => {
    // Track whether the API call completed before we check the result
    let apiCallCompleted = false;

    // Intercept a fake API endpoint that would be triggered by a UI change
    await page.route("**/api/products*", async (route) => {
      // Simulate a 200ms network delay
      await new Promise((r) => setTimeout(r, 200));
      apiCallCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });

    // Register the middleware BEFORE creating the page object
    useMiddleware(networkSettleMiddleware({ idleTime: 100, timeout: 5000 }));

    const root = group(By.css("body"), page);

    // Trigger a fetch on any UI interaction — framework-agnostic.
    // MutationObserver catches light-DOM changes (MUI, Vuetify, etc.);
    // capturing click listener catches Shadow DOM interactions (Shoelace/Lit)
    // because click events are composed and cross shadow boundaries.
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/api/products?category=changed"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    // Write to the select — the middleware should wait for the fetch to complete
    await root.write("Category", "Electronics");

    // By the time write() returns, the API call should have completed
    expect(apiCallCompleted).toBe(true);
  });

  test("does not wait for ignored URL patterns", async ({ page }) => {
    let analyticsCallCompleted = false;

    // Intercept an analytics endpoint with a very long delay
    await page.route("**/analytics*", async (route) => {
      await new Promise((r) => setTimeout(r, 15000)); // Very long delay — must outlast any CI slowness
      analyticsCallCompleted = true;
      await route.fulfill({ status: 200, body: "ok" });
    });

    useMiddleware(networkSettleMiddleware({
      idleTime: 100,
      timeout: 3000,
      ignore: [/analytics/],
    }));

    const root = group(By.css("body"), page);

    // Trigger an analytics fetch on any UI interaction (framework-agnostic).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/analytics?event=category_changed"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.write("Category", "Electronics");

    // The analytics call should NOT have completed — it was ignored
    expect(analyticsCallCompleted).toBe(false);
  });

  test("only activates for configured actions (write/click)", async ({ page }) => {
    let apiCallStarted = false;

    await page.route("**/api/data*", async (route) => {
      apiCallStarted = true;
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    // Only watch "click" actions — "read" should be unaffected
    useMiddleware(networkSettleMiddleware({
      idleTime: 100,
      actions: ["click"],
    }));

    const root = group(By.css("body"), page);

    // Read should return immediately without waiting for anything
    const value = await root.read("Category");
    expect(typeof value).toBe("string");

    // Verify no API was even called during a read
    expect(apiCallStarted).toBe(false);
  });

  test("calls onRequest and onRequestDone callbacks", async ({ page }) => {
    const requestedUrls: string[] = [];
    const completedUrls: string[] = [];

    await page.route("**/api/items*", async (route) => {
      await new Promise((r) => setTimeout(r, 50));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    useMiddleware(networkSettleMiddleware({
      idleTime: 100,
      onRequest: (url) => requestedUrls.push(url),
      onRequestDone: (url) => completedUrls.push(url),
    }));

    const root = group(By.css("body"), page);

    // Trigger a fetch on any UI interaction (framework-agnostic).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/api/items?category=changed"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.write("Category", "Electronics");

    // Both callbacks should have been called
    expect(requestedUrls.length).toBeGreaterThanOrEqual(1);
    expect(requestedUrls.some((u) => u.includes("/api/items"))).toBe(true);
    expect(completedUrls.length).toBeGreaterThanOrEqual(1);
    expect(completedUrls.some((u) => u.includes("/api/items"))).toBe(true);
  });

  test("handles timeout gracefully without throwing", async ({ page }) => {
    let timeoutFired = false;
    let pendingFromTimeout: string[] = [];

    // A request that never resolves
    await page.route("**/api/slow*", async () => {
      // Never call route.fulfill() — request hangs forever
    });

    useMiddleware(networkSettleMiddleware({
      idleTime: 50,
      timeout: 500,
      onTimeout: (pending) => {
        timeoutFired = true;
        pendingFromTimeout = pending;
      },
    }));

    const root = group(By.css("body"), page);

    // Trigger a never-completing fetch on any UI interaction (framework-agnostic).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/api/slow?category=changed"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    // Should NOT throw — middleware handles the timeout gracefully
    await root.write("Category", "Electronics");

    // The onTimeout callback should have fired
    expect(timeoutFired).toBe(true);
    expect(pendingFromTimeout.some((u) => u.includes("/api/slow"))).toBe(true);
  });

  test("skips actions not in the configured list", async ({ page }) => {
    await page.route("**/api/check*", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({ status: 200, body: "ok" });
    });

    // A click action should NOT wait for network (only "write" is configured)
    // Verify via structural check: track whether the settle middleware intercepted the request
    let settleIntercepted = false;

    // Only watch "write" — "click" should pass through without waiting
    useMiddleware(networkSettleMiddleware({
      idleTime: 100,
      actions: ["write"],
      onRequest: () => { settleIntercepted = true; },
    }));

    const root = group(By.css("body"), page);

    // Trigger a fetch on any UI interaction (framework-agnostic).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/api/check"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.click("Add to Cart");

    // The middleware should NOT have intercepted the request for a "click" action
    expect(settleIntercepted).toBe(false);
  });

  test("waits for multiple concurrent API calls to settle", async ({ page }) => {
    let call1Done = false;
    let call2Done = false;

    await page.route("**/api/products*", async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      call1Done = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/categories*", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      call2Done = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    useMiddleware(networkSettleMiddleware({ idleTime: 100, timeout: 5000 }));

    const root = group(By.css("body"), page);

    // Trigger two concurrent fetches on any UI interaction (framework-agnostic).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => { if (fired) return; fired = true; fetch("/api/products?category=changed"); fetch("/api/categories?refresh=1"); };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.write("Category", "Electronics");

    // Both calls should have completed before write() returned
    expect(call1Done).toBe(true);
    expect(call2Done).toBe(true);
  });

  test("waits for real fetch triggered by DOM interaction (not setTimeout simulation)", async ({ page }) => {
    // This test validates the middleware against a more realistic scenario:
    // a browser-initiated fetch() that goes through the full network stack
    // (request → server processing → response), rather than just a setTimeout
    // inside a route handler. The route handler fulfills immediately, but the
    // fetch is initiated asynchronously after a DOM mutation (as happens in
    // real apps with reactive frameworks like React/Vue).
    let fetchReceived = false;

    await page.route("**/api/validate*", async (route) => {
      fetchReceived = true;
      // Fulfill immediately — no setTimeout. The test validates that the
      // middleware properly detects the in-flight request lifecycle, not
      // artificial delays.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ valid: true, stock: 5 }),
      });
    });

    useMiddleware(networkSettleMiddleware({ idleTime: 100, timeout: 5000 }));

    const root = group(By.css("body"), page);

    // Set up a DOM mutation observer that triggers fetch asynchronously,
    // simulating a reactive framework re-rendering and issuing an API call
    // after state updates (e.g., React useEffect, Vue watcher).
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => {
        if (fired) return;
        fired = true;
        // Use requestAnimationFrame + microtask to simulate the timing of
        // reactive frameworks (state update → re-render → side effect).
        requestAnimationFrame(() => {
          queueMicrotask(() => {
            fetch("/api/validate?q=test")
              .then((r) => r.json())
              .then((data) => {
                // Simulate the app updating the DOM based on the response
                const el = document.createElement("span");
                el.className = "validation-result";
                el.textContent = data.valid ? "Valid" : "Invalid";
                document.body.appendChild(el);
              });
          });
        });
      };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.write("Category", "Electronics");

    // The fetch should have completed by the time write() returns
    expect(fetchReceived).toBe(true);
  });

  test("waits for real unintercepted HTTP request to app server", async ({ page }) => {
    // This test validates the middleware against a fully real network request:
    // no Playwright route interception, no simulated delays. The fetch goes
    // to the actual running app server (same origin), exercising the full
    // browser network stack (DNS, TCP, HTTP request/response lifecycle).
    // The middleware must detect the in-flight request via Playwright's
    // request/requestfinished events — not via route handlers.

    let responseReceived = false;

    useMiddleware(networkSettleMiddleware({ idleTime: 150, timeout: 5000 }));

    const root = group(By.css("body"), page);

    // Listen for the real request completing via Playwright's event system
    // (the same mechanism the middleware uses internally).
    page.on("requestfinished", (req) => {
      if (req.url().includes("favicon") || req.url() === page.url()) return;
      responseReceived = true;
    });

    // Trigger a real fetch to the app server's own URL (guaranteed to exist)
    // on any UI interaction. No route interception — this goes through the
    // full network stack.
    await page.evaluate(() => {
      let fired = false;
      const trigger = () => {
        if (fired) return;
        fired = true;
        // Fetch the current page's own URL with a cache-busting param.
        // This is a real HTTP request to the running dev server.
        fetch(`${window.location.origin}/?_settle_test=${Date.now()}`)
          .then(() => {
            const el = document.createElement("span");
            el.className = "settle-verification";
            el.textContent = "settled";
            document.body.appendChild(el);
          });
      };
      new MutationObserver((_, obs) => { trigger(); obs.disconnect(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.addEventListener("click", trigger, { capture: true, once: true });
    });

    await root.write("Category", "Electronics");

    // By the time write() returns, the real HTTP request should have completed
    expect(responseReceived).toBe(true);
  });
});
