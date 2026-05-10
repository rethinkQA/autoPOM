/**
 * Tests for the API-dependency noise filter — what counts as static, telemetry,
 * cross-origin, or caller-deny-listed.
 */

import { test, expect } from "@playwright/test";
import {
  isCrossOriginUrl,
  isStaticAssetUrl,
  isTelemetryUrl,
  shouldDropApiUrl,
} from "../../src/api-deps-filter.js";

test.describe("api-deps-filter — static assets", () => {
  test("matches simple extension URLs (.js, .css, .woff2, .map)", () => {
    expect(isStaticAssetUrl("https://app.example.com/main.js")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/styles/site.css")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/fonts/regular.woff2")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/main.js.map")).toBe(true);
  });

  test("matches URLs with cache-busting path segments after the extension", () => {
    // Cloudflare/RUM appends path segments after `.js` — the previous
    // `pathname.split(".").pop()` check missed these.
    expect(isStaticAssetUrl("https://app.example.com/beacon.min.js/v8c78df7c7c")).toBe(true);
    expect(isStaticAssetUrl("https://cdn.x.com/lib.js?v=123")).toBe(true);
  });

  test("does NOT match real API endpoints", () => {
    expect(isStaticAssetUrl("https://app.example.com/users/me")).toBe(false);
    expect(isStaticAssetUrl("https://app.example.com/api/products?page=1")).toBe(false);
    // JSON endpoints are legitimate (P2-250).
    expect(isStaticAssetUrl("https://app.example.com/api/products.json")).toBe(false);
  });

  test("matches dev-server internals", () => {
    expect(isStaticAssetUrl("https://app.example.com/@vite/client")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/__vite_ping")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/_next/static/chunks/main.js")).toBe(true);
    expect(isStaticAssetUrl("https://app.example.com/node_modules/react/index.js")).toBe(true);
  });
});

test.describe("api-deps-filter — telemetry", () => {
  test("matches Cloudflare RUM endpoints regardless of host", () => {
    expect(isTelemetryUrl("https://practicesoftwaretesting.com/cdn-cgi/rum")).toBe(true);
    expect(isTelemetryUrl("https://example.com/cdn-cgi/zaraz/t")).toBe(true);
  });

  test("matches generic beacon paths", () => {
    expect(isTelemetryUrl("https://app.example.com/beacon")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/beacon/report")).toBe(true);
  });

  test("matches known telemetry hosts (analytics, segment, sentry, datadog)", () => {
    expect(isTelemetryUrl("https://www.google-analytics.com/collect")).toBe(true);
    expect(isTelemetryUrl("https://api.segment.io/v1/track")).toBe(true);
    expect(isTelemetryUrl("https://o1234.ingest.sentry.io/api/x/store")).toBe(true);
    expect(isTelemetryUrl("https://browser-intake-datadoghq.com/v1/input/abc")).toBe(false); // not in list
    expect(isTelemetryUrl("https://logs.datadoghq.com/v1/input")).toBe(true);
  });

  test("does NOT match legitimate same-host API endpoints", () => {
    expect(isTelemetryUrl("https://app.example.com/api/users")).toBe(false);
    expect(isTelemetryUrl("https://app.example.com/login")).toBe(false);
  });

  test("Slice 7B — drops first-party event/track/log endpoints", () => {
    // Sauce Demo's analytics. Same-origin so the cross-origin filter wouldn't
    // catch them; pattern-based drop is the only signal we have.
    expect(isTelemetryUrl("https://www.saucedemo.com/api/summed-events/submit?token=x")).toBe(true);
    expect(isTelemetryUrl("https://www.saucedemo.com/api/unique-events/submit")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/api/events/v1")).toBe(true);

    expect(isTelemetryUrl("https://app.example.com/api/track")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/api/log?level=info")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/api/metrics")).toBe(true);

    expect(isTelemetryUrl("https://app.example.com/v1/events")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/v2/event")).toBe(true);

    expect(isTelemetryUrl("https://app.example.com/track")).toBe(true);
    expect(isTelemetryUrl("https://app.example.com/analytics")).toBe(true);
  });

  test("Slice 7B — does NOT mistakenly drop real CRUD endpoints", () => {
    expect(isTelemetryUrl("https://app.example.com/api/users")).toBe(false);
    expect(isTelemetryUrl("https://app.example.com/api/orders/123")).toBe(false);
    expect(isTelemetryUrl("https://app.example.com/api/products")).toBe(false);
    // 'eventList' isn't an event endpoint by our pattern.
    expect(isTelemetryUrl("https://app.example.com/api/eventList")).toBe(false);
  });
});

test.describe("api-deps-filter — cross-origin", () => {
  test("returns true when origins differ", () => {
    expect(isCrossOriginUrl("https://api.other.com/v1/x", "https://app.example.com/")).toBe(true);
  });

  test("returns false when origins match", () => {
    expect(isCrossOriginUrl("https://app.example.com/users", "https://app.example.com/login")).toBe(false);
  });

  test("returns false when pageOrigin is missing or unparsable", () => {
    expect(isCrossOriginUrl("https://api.other.com/x", undefined)).toBe(false);
    expect(isCrossOriginUrl("https://api.other.com/x", "not a url")).toBe(false);
  });
});

test.describe("api-deps-filter — top-level shouldDropApiUrl", () => {
  test("default options drop static + telemetry but keep first-party APIs", () => {
    // Real captures from practicesoftwaretesting.
    expect(shouldDropApiUrl("https://practicesoftwaretesting.com/cdn-cgi/rum")).toBe(true);
    expect(shouldDropApiUrl("https://practicesoftwaretesting.com/beacon.min.js/v8c78df7c7c"))
      .toBe(true);
    expect(shouldDropApiUrl("https://practicesoftwaretesting.com/assets/i18n/en.json"))
      .toBe(false); // .json with no extra segment is a real API
    expect(shouldDropApiUrl("https://practicesoftwaretesting.com/users/login")).toBe(false);
    expect(shouldDropApiUrl("https://practicesoftwaretesting.com/users/me")).toBe(false);
  });

  test("cross-origin URLs are dropped when pageOrigin is set and keepThirdParty is false", () => {
    expect(
      shouldDropApiUrl("https://api.partner.com/v1/data", { pageOrigin: "https://app.example.com" }),
    ).toBe(true);
  });

  test("cross-origin URLs are kept when keepThirdParty is true (telemetry still drops)", () => {
    expect(
      shouldDropApiUrl("https://api.partner.com/v1/data", {
        pageOrigin: "https://app.example.com",
        keepThirdParty: true,
      }),
    ).toBe(false);
    // Telemetry still drops even with keepThirdParty.
    expect(
      shouldDropApiUrl("https://www.google-analytics.com/collect", {
        pageOrigin: "https://app.example.com",
        keepThirdParty: true,
      }),
    ).toBe(true);
  });

  test("ignorePatterns drop matching URLs", () => {
    expect(
      shouldDropApiUrl("https://app.example.com/api/internal-debug", {
        ignorePatterns: [/internal-debug/],
      }),
    ).toBe(true);
  });
});
