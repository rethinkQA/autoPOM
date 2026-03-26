/**
 * DOM Flight Recorder — Phase 14.
 *
 * Human-guided recording mode for the crawler. Injects a
 * MutationObserver into the page that watches for group-like
 * elements materializing in the DOM (e.g. dialogs opening,
 * toasts appearing). Discovered groups are bucketed by URL
 * pathname so each page produces its own manifest.
 *
 * Usage:
 *   const recorder = new DomRecorder(page);
 *   await recorder.start();
 *   // ... user interacts with the page ...
 *   const byPage = await recorder.harvestByPage();
 *   await recorder.stop();
 */

import type { Page } from "playwright";
import type { ManifestGroup } from "./types.js";
import { discoverGroups, discoverToasts, GROUP_SELECTOR } from "./discover.js";

/** Groups discovered on a single page URL. */
export interface PageRecording {
  /** The full URL of the page. */
  url: string;
  /** The URL pathname (used as the bucketing key). */
  pathname: string;
  /** Groups discovered on this page. */
  groups: ManifestGroup[];
}

// ── Types for browser ↔ Node communication ──────────────────

/** Raw record of a group-like element that appeared in the DOM. */
interface ObservedEntry {
  /** Timestamp (ms since epoch) when the element was observed. */
  timestamp: number;
  /** Tag name of the matched element. */
  tagName: string;
  /** aria-label or other identifying attribute. */
  label: string | null;
  /** CSS selector built from the element. */
  selector: string;
  /** ARIA role if present. */
  role: string | null;
}

/** Raw record of a user action captured by the action logger. */
interface ActionEntry {
  /** Timestamp (ms since epoch) of the action. */
  timestamp: number;
  /** Human-readable description (e.g. "click on 'Add to Cart'"). */
  description: string;
}

// ── In-browser script ───────────────────────────────────────

/**
 * Script evaluated inside the browser context to set up the
 * MutationObserver and action logger. Communicates back to Node
 * via `window.__pw_recorder_*` globals.
 */
const INIT_SCRIPT = /* js */ `
(() => {
  // Avoid double-init (e.g. if page navigates and script re-runs)
  if (window.__pw_recorder_entries) return;

  const GROUP_SELECTOR = ${JSON.stringify(GROUP_SELECTOR)};
  const TOAST_SELECTOR = '[aria-live="polite"], [aria-live="assertive"]';

  /** All group-like elements observed appearing in the DOM. */
  window.__pw_recorder_entries = [];

  /** All user actions captured for triggeredBy attribution. */
  window.__pw_recorder_actions = [];

  /** Set of selectors already seen (dedup within the session). */
  const seen = new Set();
  /** P2-322: Track elements by identity to avoid duplicate entries on attribute changes. */
  const seenElements = new WeakSet();

  /** Track elements in initial DOM so we only record NEW ones.
   *  P2-303: Use queue-based deep traversal to pierce all shadow DOM levels.
   */
  function markInitialElements() {
    const queue = [document.body];
    while (queue.length > 0) {
      const root = queue.shift();
      if (!root) continue;
      for (const el of root.querySelectorAll(GROUP_SELECTOR + ', ' + TOAST_SELECTOR)) {
        const key = buildKey(el);
        if (key) seen.add(key);
        seenElements.add(el);
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          queue.push(el.shadowRoot);
        }
      }
    }
  }

  // P2-321: Use null byte as delimiter to avoid collision with attribute values containing '::'.
  function buildKey(el) {
    const tag = el.tagName.toLowerCase();
    const label = el.getAttribute('aria-label') || '';
    const role = el.getAttribute('role') || '';
    const id = el.getAttribute('id') || '';
    // Add positional index to disambiguate identical sibling elements
    let idx = 0;
    if (el.parentElement) {
      const siblings = Array.from(el.parentElement.children).filter(
        function(c) { return c.tagName === el.tagName; }
      );
      if (siblings.length > 1) idx = siblings.indexOf(el);
    }
    return tag + '\0' + role + '\0' + label + '\0' + id + '\0' + idx;
  }

  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) return '#' + CSS.escape(id);
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return tag + '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    const className = el.className;
    if (className && typeof className === 'string' && className.trim()) {
      const first = className.trim().split(/\\s+/)[0];
      return tag + '.' + CSS.escape(first);
    }
    return tag;
  }

  function processElement(el) {
    // P2-322: check element identity first to prevent duplicates on attribute changes
    if (seenElements.has(el)) return;
    const key = buildKey(el);
    if (!key || seen.has(key)) return;
    seen.add(key);
    seenElements.add(el);

    window.__pw_recorder_entries.push({
      timestamp: Date.now(),
      tagName: el.tagName.toLowerCase(),
      label: el.getAttribute('aria-label') || el.querySelector(':scope > legend')?.textContent?.trim() || null,
      selector: buildSelector(el),
      role: el.getAttribute('role'),
    });
  }

  function checkNode(node) {
    if (!(node instanceof Element)) return;
    // Check the node itself
    if (node.matches(GROUP_SELECTOR) || node.matches(TOAST_SELECTOR)) {
      processElement(node);
    }
    // Check descendants
    for (const el of node.querySelectorAll(GROUP_SELECTOR + ', ' + TOAST_SELECTOR)) {
      processElement(el);
    }
    // Pierce shadow roots
    if (node.shadowRoot) {
      for (const el of node.shadowRoot.querySelectorAll(GROUP_SELECTOR + ', ' + TOAST_SELECTOR)) {
        processElement(el);
      }
    }
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) {
        for (const inner of el.shadowRoot.querySelectorAll(GROUP_SELECTOR + ', ' + TOAST_SELECTOR)) {
          processElement(inner);
        }
      }
    }
  }

  // Mark initial DOM elements before starting observer
  markInitialElements();

  // P2-174: Attach MutationObserver to each discovered shadow root
  // so dynamic changes inside existing shadow DOM are captured.
  function observeNode(root) {
    const obs = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          checkNode(node);
        }
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          if (mutation.target.matches(GROUP_SELECTOR) || mutation.target.matches(TOAST_SELECTOR)) {
            processElement(mutation.target);
          }
        }
      }
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-label', 'aria-labelledby', 'aria-live', 'open'],
    });
    return obs;
  }

  // Start MutationObserver on document.body
  const mainObserver = observeNode(document.body);
  const shadowObservers = [];

  // Also observe existing shadow roots
  const queue = [document.body];
  while (queue.length > 0) {
    const root = queue.shift();
    if (!root) continue;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        shadowObservers.push(observeNode(el.shadowRoot));
        queue.push(el.shadowRoot);
      }
    }
  }

  // Action logger — capture clicks with descriptive labels
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const text = target.textContent?.trim().slice(0, 60) || '';
    const tag = target.tagName.toLowerCase();
    const ariaLabel = target.getAttribute('aria-label') || '';
    const desc = ariaLabel
      ? 'click on "' + ariaLabel + '"'
      : text
        ? 'click on "' + text + '" (' + tag + ')'
        : 'click on ' + tag;
    window.__pw_recorder_actions.push({
      timestamp: Date.now(),
      description: desc,
    });
  }, { capture: true });

  window.__pw_recorder_observer = mainObserver;
  window.__pw_recorder_shadow_observers = shadowObservers;
})();
`;

// ── DomRecorder class ───────────────────────────────────────

/**
 * DOM Flight Recorder.
 *
 * Attaches to a Playwright Page and records group-like elements
 * that appear in the DOM during user interaction. Groups are
 * bucketed by URL pathname so each page produces its own manifest.
 */
export class DomRecorder {
  private started = false;
  /** Initial groups per page (keyed by pathname → mergeKey set). */
  private initialGroupsByPage = new Map<string, Set<string>>();

  // ── Per-page storage ──────────────────────────────────────
  /** Completed page recordings (pages the user has navigated away from). */
  private completedPages: PageRecording[] = [];
  /** The URL of the page currently being recorded. */
  private currentUrl: string = "";
  /** The pathname of the current page. */
  private currentPathname: string = "";
  /** Groups discovered on previously-visited pages (for the flat harvest() fallback). */
  private priorPageGroups: ManifestGroup[] = [];

  /** Bound handler reference so we can remove it in stop(). */
  private onNavigation: (() => Promise<void>) | null = null;

  constructor(
    private readonly page: Page,
    private readonly scope?: string,
  ) {}

  /**
   * Inject the MutationObserver into the page.
   * Call this after the page has loaded its initial DOM.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Track the initial page URL
    this.currentUrl = this.page.url();
    this.currentPathname = safePathname(this.currentUrl);

    // P2-317: Inject MutationObserver FIRST so it captures any mutations
    // that occur during the snapshot.
    await this.page.evaluate(INIT_SCRIPT);

    // Snapshot initial DOM state so we can diff at harvest time
    await this.snapshotInitialGroups();

    // Re-inject after every full-page navigation.
    // Each navigation destroys browser globals, so we finalize the current page first.
    this.onNavigation = async () => {
      // 1. Finalize the page we're leaving — discover its groups and store them.
      await this.finalizeCurrentPage();

      // 2. Update current URL to the new page.
      this.currentUrl = this.page.url();
      this.currentPathname = safePathname(this.currentUrl);

      // 3. Re-inject INIT_SCRIPT into the new page.
      try {
        await this.page.evaluate(INIT_SCRIPT);
      } catch {
        // Page may still be loading — will retry on next navigation or harvest.
      }

      // 4. Snapshot new page's initial groups.
      await this.snapshotInitialGroups();

      console.error(`  ↳ Navigated to ${this.currentPathname}`);
    };

    this.page.on("domcontentloaded", this.onNavigation);
  }

  /** Snapshot initial groups on the current page so we can diff later. */
  private async snapshotInitialGroups(): Promise<void> {
    try {
      const [initGroups, initToasts] = await Promise.all([
        discoverGroups(this.page, { scope: this.scope, pass: "record-init" }),
        discoverToasts(this.page, { scope: this.scope, pass: "record-init" }),
      ]);
      const keys = this.initialGroupsByPage.get(this.currentPathname) ?? new Set<string>();
      for (const g of [...initGroups, ...initToasts]) {
        keys.add(`${g.groupType}::${g.wrapperType}::${g.label}`);
      }
      this.initialGroupsByPage.set(this.currentPathname, keys);
    } catch {
      // Discovery may fail if page is mid-load — acceptable.
    }
  }

  /**
   * Finalize the current page: run full discovery and store as a completed page recording.
   * Called on navigation away from a page.
   */
  private async finalizeCurrentPage(): Promise<void> {
    try {
      // Discover groups on the current DOM (before navigation destroys it).
      // Note: by the time domcontentloaded fires for the new page, the old DOM
      // is actually gone. We do our best — the new page's DOM is what we see.
      // Instead, we'll discover on the NEW page in harvestCurrentPage().
    } catch {
      // Ignored — covered by harvestCurrentPage at the end.
    }

    // Flush browser globals into a completed recording.
    let groups: ManifestGroup[] = [];
    try {
      groups = await this.discoverNewGroups();
    } catch {
      // Old execution context may be gone — that's OK, we'll re-discover on harvest.
    }

    if (groups.length > 0) {
      this.completedPages.push({
        url: this.currentUrl,
        pathname: this.currentPathname,
        groups,
      });
      this.priorPageGroups.push(...groups);
    }
  }

  /**
   * Discover groups on the current page that are new (weren't in the initial snapshot).
   */
  private async discoverNewGroups(): Promise<ManifestGroup[]> {
    const passTag = "record";
    const [fullGroups, fullToasts] = await Promise.all([
      discoverGroups(this.page, { scope: this.scope, pass: passTag }),
      discoverToasts(this.page, { scope: this.scope, pass: passTag }),
    ]);

    const initialKeys = this.initialGroupsByPage.get(this.currentPathname) ?? new Set<string>();
    const result: ManifestGroup[] = [];
    const seenKeys = new Set<string>();

    for (const group of [...fullGroups, ...fullToasts]) {
      const key = `${group.groupType}::${group.wrapperType}::${group.label}`;
      if (initialKeys.has(key)) continue;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      result.push({
        ...group,
        visibility: "exploration",
        discoveredIn: "record",
      });
    }

    return result;
  }

  /**
   * Harvest groups bucketed by page URL.
   *
   * Returns a PageRecording for each unique URL pathname visited,
   * including the current page (final discovery).
   */
  async harvestByPage(): Promise<PageRecording[]> {
    // Discover groups on the current (final) page
    let currentGroups: ManifestGroup[] = [];
    try {
      currentGroups = await this.discoverNewGroups();
    } catch {
      // Browser context may be gone (e.g. Ctrl+C race).
    }

    // Merge completed pages by pathname (same pathname visited twice = merge groups)
    const byPathname = new Map<string, PageRecording>();

    for (const recording of this.completedPages) {
      const existing = byPathname.get(recording.pathname);
      if (existing) {
        // Merge groups, dedup by key
        const keys = new Set(existing.groups.map(g => `${g.groupType}::${g.wrapperType}::${g.label}`));
        for (const g of recording.groups) {
          const key = `${g.groupType}::${g.wrapperType}::${g.label}`;
          if (!keys.has(key)) {
            keys.add(key);
            existing.groups.push(g);
          }
        }
      } else {
        byPathname.set(recording.pathname, { ...recording, groups: [...recording.groups] });
      }
    }

    // Add current page
    if (currentGroups.length > 0 || !byPathname.has(this.currentPathname)) {
      const existing = byPathname.get(this.currentPathname);
      if (existing) {
        const keys = new Set(existing.groups.map(g => `${g.groupType}::${g.wrapperType}::${g.label}`));
        for (const g of currentGroups) {
          const key = `${g.groupType}::${g.wrapperType}::${g.label}`;
          if (!keys.has(key)) {
            keys.add(key);
            existing.groups.push(g);
          }
        }
      } else {
        byPathname.set(this.currentPathname, {
          url: this.currentUrl,
          pathname: this.currentPathname,
          groups: currentGroups,
        });
      }
    }

    return Array.from(byPathname.values());
  }

  /**
   * Harvest all groups as a flat list (all pages combined).
   * Kept for backward compatibility and single-file output mode.
   */
  async harvest(): Promise<ManifestGroup[]> {
    const pages = await this.harvestByPage();
    const all: ManifestGroup[] = [];
    const seenKeys = new Set<string>();
    for (const page of pages) {
      for (const g of page.groups) {
        const key = `${g.groupType}::${g.wrapperType}::${g.label}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          all.push(g);
        }
      }
    }
    return all;
  }

  /**
   * Return groups accumulated from previously-visited pages.
   * Used as a fallback when harvest() fails due to browser closing.
   */
  getAccumulatedGroups(): ManifestGroup[] {
    return this.priorPageGroups.map(g => ({
      ...g,
      visibility: "exploration" as const,
      discoveredIn: "record" as const,
    }));
  }

  /**
   * Return completed page recordings as a fallback when harvestByPage() fails.
   */
  getAccumulatedPages(): PageRecording[] {
    return this.completedPages.map(p => ({
      ...p,
      groups: p.groups.map(g => ({
        ...g,
        visibility: "exploration" as const,
        discoveredIn: "record" as const,
      })),
    }));
  }

  /**
   * Stop the MutationObserver and clean up browser globals.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    // Remove the navigation re-injection listener
    if (this.onNavigation) {
      this.page.off("domcontentloaded", this.onNavigation);
      this.onNavigation = null;
    }

    try {
      await this.page.evaluate(() => {
        const w = window as any;
        if (w.__pw_recorder_observer) {
          w.__pw_recorder_observer.disconnect();
          delete w.__pw_recorder_observer;
        }
        // P2-174: disconnect shadow root observers
        if (w.__pw_recorder_shadow_observers) {
          for (const obs of w.__pw_recorder_shadow_observers) {
            obs.disconnect();
          }
          delete w.__pw_recorder_shadow_observers;
        }
        delete w.__pw_recorder_entries;
        delete w.__pw_recorder_actions;
      });
    } catch {
      // Browser context may already be gone — nothing to clean up.
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Extract the pathname from a URL string, falling back to "/" on parse failure.
 */
function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/** Minimal tag→GroupType classification for fallback entries. */
function classifyTagToGroupType(
  tagName: string,
  role: string | null,
): ManifestGroup["groupType"] {
  if (role === "dialog" || role === "alertdialog" || tagName === "dialog") return "generic";
  if (tagName === "nav" || role === "navigation") return "nav";
  if (tagName === "header") return "header";
  if (tagName === "footer") return "footer";
  if (tagName === "main") return "main";
  if (tagName === "aside") return "aside";
  if (tagName === "fieldset" || role === "group") return "fieldset";
  if (tagName === "form") return "form";
  if (tagName === "section" || role === "region") return "section";
  return "generic";
}

/** Minimal tag→WrapperType classification for fallback entries. */
function classifyTagToWrapperType(
  tagName: string,
  role: string | null,
): ManifestGroup["wrapperType"] {
  if (tagName === "table" || role === "table") return "table";
  if (tagName === "dialog" || role === "dialog" || role === "alertdialog") return "dialog";
  // Check for toast-like live regions
  if (role === "status" || role === "alert" || role === "log") return "toast";
  return "group";
}
