/**
 * Unit tests for exploration graph and heuristic action risk logic.
 */

import { test, expect } from "@playwright/test";
import { createExplorationGraph } from "../../src/explore.js";
import { classifyActionRisk } from "../../src/explore-planner.js";

// ── classifyActionRisk ──────────────────────────────────────

test.describe("Exploration planner — action risk", () => {
  test("classifies destructive labels as destructive", () => {
    expect(classifyActionRisk("Delete product", { role: "button", name: "Delete product" })).toBe("destructive");
    expect(classifyActionRisk("Sign out", { role: "button", name: "Sign out" })).toBe("destructive");
  });

  test("classifies internal links as navigation", () => {
    expect(classifyActionRisk("Products", {
      role: "link",
      name: "Products",
      href: "http://localhost:3001/products",
      isInternalHref: true,
    })).toBe("navigation");
  });

  test("classifies external links as unknown", () => {
    expect(classifyActionRisk("Docs", {
      role: "link",
      name: "Docs",
      href: "https://example.com/docs",
      isInternalHref: false,
    })).toBe("unknown");
  });

  test("allows explicit allow patterns to override unknown labels", () => {
    expect(classifyActionRisk("Inventory", { role: "button", name: "Inventory" }, "click", [/inventory/i])).toBe("safe");
  });
});

// ── createExplorationGraph ──────────────────────────────────

test.describe("Exploration graph", () => {
  test("creates an empty graph with summary counters", () => {
    const graph = createExplorationGraph("http://localhost:3001", "conservative");

    expect(graph.schemaVersion).toBe(1);
    expect(graph.startUrl).toBe("http://localhost:3001");
    expect(graph.strategy).toBe("conservative");
    expect(graph.states).toEqual([]);
    expect(graph.actions).toEqual([]);
    expect(graph.transitions).toEqual([]);
    expect(graph.summary).toEqual({
      attemptedActions: 0,
      succeededActions: 0,
      failedActions: 0,
      skippedActions: 0,
      routeCount: 0,
    });
  });
});
