/**
 * SPA navigation interception — detects client-side route changes.
 *
 * SPAs use `history.pushState()` / `replaceState()` and hash changes
 * instead of full-page loads. Playwright's `domcontentloaded` event
 * never fires for these. This module patches the History API and
 * listens for popstate/hashchange to detect all navigation.
 *
 * Usage:
 *   1. `page.exposeFunction("__pwRouteChanged", handler)` — before goto
 *   2. Call `injectNavigationInterceptor(page)` after page load
 *   3. Re-inject on `page.on("load")` for full-page navigations
 */

import type { Page } from "playwright";

/**
 * Browser-side script that intercepts SPA navigations.
 *
 * Patches `history.pushState` and `history.replaceState`, and listens
 * for `popstate` and `hashchange` events. All detected route changes
 * call `window.__pwRouteChanged(url)` which is exposed via Playwright.
 */
const NAV_INTERCEPT_SCRIPT = () => {
  if ((window as any).__pwNavIntercepted) return;
  (window as any).__pwNavIntercepted = true;

  const notify = () => {
    try {
      (window as any).__pwRouteChanged(location.href);
    } catch {
      // __pwRouteChanged not exposed yet — ignore
    }
  };

  // Patch history.pushState
  const origPush = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    origPush(...args);
    notify();
  };

  // Patch history.replaceState
  const origReplace = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    origReplace(...args);
    notify();
  };

  // Back/forward buttons
  window.addEventListener("popstate", () => notify());

  // Hash-based routing
  window.addEventListener("hashchange", () => notify());
};

/**
 * Inject the SPA navigation interceptor into the page.
 *
 * Safe to call multiple times — subsequent calls are no-ops in the browser.
 * Must be called AFTER `page.exposeFunction("__pwRouteChanged", ...)`.
 */
export async function injectNavigationInterceptor(page: Page): Promise<void> {
  await page.evaluate(NAV_INTERCEPT_SCRIPT).catch(() => {
    // May fail during navigation — acceptable, will retry on next load
  });
}
