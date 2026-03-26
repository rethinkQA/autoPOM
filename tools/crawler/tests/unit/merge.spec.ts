/**
 * Unit tests for manifest merge and diff logic.
 * These don't require a browser — pure TypeScript logic.
 */

import { test, expect } from "@playwright/test";
import { mergeManifest, diffManifest, mergeKey } from "../../src/merge.js";
import type { CrawlerManifest, ManifestGroup } from "../../src/types.js";

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

// ── mergeKey ────────────────────────────────────────────────

test.describe("mergeKey", () => {
  test("produces stable key from groupType and label", () => {
    const g1 = makeGroup({ label: "Nav", groupType: "nav", selector: "nav:nth-of-type(1)" });
    const g2 = makeGroup({ label: "Nav", groupType: "nav", selector: "nav[aria-label=\"Nav\"]" });
    expect(mergeKey(g1)).toBe(mergeKey(g2));
    expect(mergeKey(g1)).toBe("nav::group::Nav");
  });

  test("differs for groups with different labels", () => {
    const g1 = makeGroup({ label: "Nav", groupType: "nav" });
    const g2 = makeGroup({ label: "Footer", groupType: "nav" });
    expect(mergeKey(g1)).not.toBe(mergeKey(g2));
  });

  test("differs for groups with different groupTypes", () => {
    const g1 = makeGroup({ label: "Content", groupType: "section" });
    const g2 = makeGroup({ label: "Content", groupType: "region" });
    expect(mergeKey(g1)).not.toBe(mergeKey(g2));
  });
});

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

  test("updates existing groups with matching merge key", () => {
    const existing = makeManifest([
      makeGroup({ label: "Navigation", selector: "nav:nth-of-type(1)", groupType: "nav" }),
    ]);

    const newGroups = [
      makeGroup({ label: "Navigation", selector: "nav[aria-label=\"Navigation\"]", groupType: "nav" }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 2, null);

    expect(result.groups).toHaveLength(1);
    // Selector should be updated from the new pass
    expect(result.groups[0].selector).toBe('nav[aria-label="Navigation"]');
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
      makeGroup({ label: "Existing", selector: "#existing" }),
    ]);

    const newGroups = [
      makeGroup({ label: "Pass 3 Group", selector: "#p3" }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 3, null);
    const p3Group = result.groups.find((g) => g.label === "Pass 3 Group");

    expect(p3Group).toBeDefined();
    expect(p3Group!.discoveredIn).toBe("pass-3");
  });

  test("matches groups by mergeKey when selectors drift", () => {
    // Simulate disambiguateSelectors producing a different selector across passes
    const existing = makeManifest([
      makeGroup({
        label: "Navigation",
        selector: "nav:nth-of-type(1)",
        groupType: "nav",
        discoveredIn: "pass-1",
      }),
    ]);

    // Same logical group, but selector changed due to DOM reordering
    const newGroups = [
      makeGroup({
        label: "Navigation",
        selector: "nav[aria-label=\"Navigation\"]",
        groupType: "nav",
      }),
    ];

    const result = mergeManifest(existing, newGroups, "http://localhost:3001/", 2, null);

    expect(result.groups).toHaveLength(1);
    // Selector should be updated, but discoveredIn preserved
    expect(result.groups[0].selector).toBe('nav[aria-label="Navigation"]');
    expect(result.groups[0].discoveredIn).toBe("pass-1");
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
    const groups = [
      makeGroup({ selector: "nav", label: "Nav", groupType: "nav" }),
      makeGroup({ selector: "footer", label: "Footer", groupType: "footer" }),
    ];
    const manifest = makeManifest(groups);

    const diff = diffManifest(manifest, groups);

    expect(diff.unchanged).toBe(true);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  test("detects added groups", () => {
    const manifest = makeManifest([makeGroup({ selector: "nav", label: "Nav", groupType: "nav" })]);
    const current = [
      makeGroup({ selector: "nav", label: "Nav", groupType: "nav" }),
      makeGroup({ selector: "footer", label: "Footer", groupType: "footer" }),
    ];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].label).toBe("Footer");
  });

  test("detects removed groups", () => {
    const manifest = makeManifest([
      makeGroup({ selector: "nav", label: "Nav", groupType: "nav" }),
      makeGroup({ selector: "#gone", label: "Gone Section", groupType: "section" }),
    ]);
    const current = [makeGroup({ selector: "nav", label: "Nav", groupType: "nav" })];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].label).toBe("Gone Section");
  });

  test("detects changed groups (selector drift)", () => {
    const manifest = makeManifest([
      makeGroup({ selector: "nav:nth-of-type(1)", label: "Nav", groupType: "nav" }),
    ]);
    const current = [
      makeGroup({ selector: "nav[aria-label=\"Nav\"]", label: "Nav", groupType: "nav" }),
    ];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].before.selector).toBe("nav:nth-of-type(1)");
    expect(diff.changed[0].after.selector).toBe('nav[aria-label="Nav"]');
  });

  test("handles empty manifest", () => {
    const manifest = makeManifest([]);
    const current = [makeGroup({ selector: "nav", label: "Nav" })];

    const diff = diffManifest(manifest, current);

    expect(diff.unchanged).toBe(false);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  test("handles empty current", () => {
    const manifest = makeManifest([makeGroup({ selector: "nav", label: "Nav" })]);

    const diff = diffManifest(manifest, []);

    expect(diff.unchanged).toBe(false);
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });
});
