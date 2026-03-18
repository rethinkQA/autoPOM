/**
 * Unit tests for manifest merge and diff logic.
 * These don't require a browser — pure TypeScript logic.
 */

import { test, expect } from "@playwright/test";
import { mergeManifest, diffManifest } from "../src/merge.js";
import type { CrawlerManifest, ManifestGroup } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────

function makeGroup(overrides: Partial<ManifestGroup> = {}): ManifestGroup {
  return {
    label: "Test Group",
    selector: "fieldset.test",
    groupType: "fieldset",
    wrapperType: "group",
    discoveredIn: "pass-1",
    visibility: "static",
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

function makeManifest(groups: ManifestGroup[], overrides: Partial<CrawlerManifest> = {}): CrawlerManifest {
  return {
    schemaVersion: 1,
    url: "http://localhost:3001/",
    timestamp: new Date().toISOString(),
    scope: null,
    passCount: 1,
    groups,
    ...overrides,
  };
}

// ── mergeManifest ───────────────────────────────────────────

test.describe("mergeManifest", () => {
  test("creates new manifest when existing is null", () => {
    const groups = [makeGroup({ label: "Nav", selector: "nav" })];
    const result = mergeManifest(null, groups, "http://localhost:3001/", 1, null);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Nav");
    expect(result.passCount).toBe(1);
    expect(result.url).toBe("http://localhost:3001/");
  });

  test("preserves existing groups not in new crawl", () => {
    const existing = makeManifest([
      makeGroup({ label: "Old Section", selector: "#old" }),
    ]);

    const newGroups = [
      makeGroup({ label: "New Section", selector: "#new" }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 2, null);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.some((g) => g.selector === "#old")).toBe(true);
    expect(result.groups.some((g) => g.selector === "#new")).toBe(true);
  });

  test("updates existing groups with matching selector", () => {
    const existing = makeManifest([
      makeGroup({ label: "Old Label", selector: "nav" }),
    ]);

    const newGroups = [
      makeGroup({ label: "Updated Label", selector: "nav" }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 2, null);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Updated Label");
    // discoveredIn should be preserved from the original
    expect(result.groups[0].discoveredIn).toBe("pass-1");
  });

  test("increments passCount", () => {
    const existing = makeManifest([], { passCount: 1 });
    const result = mergeManifest(existing, [], "http://localhost:3001/", 3, null);
    expect(result.passCount).toBe(3);
  });

  test("new groups get correct pass tag", () => {
    const existing = makeManifest([
      makeGroup({ selector: "#existing" }),
    ]);

    const newGroups = [
      makeGroup({ label: "Pass 3 Group", selector: "#p3" }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 3, null);
    const p3Group = result.groups.find((g) => g.selector === "#p3");

    expect(p3Group).toBeDefined();
    expect(p3Group!.discoveredIn).toBe("pass-3");
  });

  test("preserves apiDependencies from existing manifest", () => {
    const existing = makeManifest([], {
      apiDependencies: [
        { pattern: "/api/products", method: "GET", timing: "page-load" },
      ],
    });

    const result = mergeManifest(existing, [], "http://localhost:3001/", 2, null);
    expect(result.apiDependencies).toHaveLength(1);
    expect(result.apiDependencies![0].pattern).toBe("/api/products");
  });
});

// ── diffManifest ────────────────────────────────────────────

test.describe("diffManifest", () => {
  test("reports unchanged when identical", () => {
    const groups = [makeGroup({ selector: "nav" }), makeGroup({ selector: "footer" })];
    const manifest = makeManifest(groups);

    const diff = diffManifest(manifest, groups);

    expect(diff.unchanged).toBe(true);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  test("detects added groups", () => {
    const manifest = makeManifest([makeGroup({ selector: "nav" })]);
    const current = [
      makeGroup({ selector: "nav" }),
      makeGroup({ selector: "footer", label: "Footer" }),
    ];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].selector).toBe("footer");
  });

  test("detects removed groups", () => {
    const manifest = makeManifest([
      makeGroup({ selector: "nav" }),
      makeGroup({ selector: "#gone" }),
    ]);
    const current = [makeGroup({ selector: "nav" })];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].selector).toBe("#gone");
  });

  test("detects changed groups", () => {
    const manifest = makeManifest([
      makeGroup({ selector: "nav", label: "Old Nav" }),
    ]);
    const current = [
      makeGroup({ selector: "nav", label: "New Nav" }),
    ];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].before.label).toBe("Old Nav");
    expect(diff.changed[0].after.label).toBe("New Nav");
  });

  test("handles empty manifest", () => {
    const manifest = makeManifest([]);
    const current = [makeGroup({ selector: "nav" })];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  test("handles empty current", () => {
    const manifest = makeManifest([makeGroup({ selector: "nav" })]);

    const diff = diffManifest(manifest, []);

    expect(diff.unchanged).toBe(false);
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });
});
