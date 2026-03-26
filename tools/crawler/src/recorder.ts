/**
 * DOM Flight Recorder — Phase 14.
 *
 * Human-guided recording mode for the crawler. Injects a
 * MutationObserver into the page that watches for group-like
 * elements materializing in the DOM (e.g. dialogs opening,
 * toasts appearing). User actions are logged so discovered
 * groups can be attributed to the interaction that triggered them.
 *
 * Usage:
 *   const recorder = new DomRecorder(page);
 *   await recorder.start();
 *   // ... user interacts with the page ...
 *   const groups = await recorder.harvest();
 *   await recorder.stop();
 */

import type { Page } from "playwright";
import type { ManifestGroup } from "./types.js";
import { discoverGroups, discoverToasts, GROUP_SELECTOR } from "./discover.js";

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
 * that appear in the DOM during user interaction. Call `harvest()`
 * to get the discovered groups as ManifestGroup entries with
 * `triggeredBy` attribution.
 */
export class DomRecorder {
  private started = false;
  /** Groups discovered in the initial DOM (before any user interaction). */
  private initialGroups = new Map<string, ManifestGroup>();

  constructor(
    private readonly page: Page,
    private readonly scope?: string,
  ) {}

  /**
   * Inject the MutationObserver and action logger into the page.
   * Call this after the page has loaded its initial DOM.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // P2-317: Inject MutationObserver FIRST so it captures any mutations
    // that occur during the snapshot. This closes the race window where
    // mutations between snapshot and observer injection would be missed.
    await this.page.evaluate(INIT_SCRIPT);

    // Now snapshot initial DOM state so we can diff at harvest time
    const [initGroups, initToasts] = await Promise.all([
      discoverGroups(this.page, { scope: this.scope, pass: "record-init" }),
      discoverToasts(this.page, { scope: this.scope, pass: "record-init" }),
    ]);
    for (const g of [...initGroups, ...initToasts]) {
      this.initialGroups.set(`${g.groupType}::${g.wrapperType}::${g.label}`, g);
    }
  }

  /**
   * Harvest all groups that appeared since recording started.
   *
   * Uses the framework's full `discoverGroups()` + `discoverToasts()`
   * to get properly classified ManifestGroup entries, then filters
   * to only those matching the observer's recorded selectors/labels.
   * Falls back to raw observer data for groups the full discovery
   * might miss (e.g. elements that were removed before harvest).
   *
   * Each group is tagged with `visibility: "exploration"` and
   * `triggeredBy` set to the nearest preceding user action.
   */
  async harvest(): Promise<ManifestGroup[]> {
    // P2-258: Combine entries and actions into a single page.evaluate() call
    // to avoid race condition from two separate evaluate calls.
    const { observed, actions } = await this.page.evaluate(() => {
      const w = window as any;
      return {
        observed: (w.__pw_recorder_entries as ObservedEntry[]) ?? [],
        actions: (w.__pw_recorder_actions as ActionEntry[]) ?? [],
      };
    });

    // Run full discovery on current DOM state to get properly classified groups
    const passTag = "record";
    const [fullGroups, fullToasts] = await Promise.all([
      discoverGroups(this.page, { scope: this.scope, pass: passTag }),
      discoverToasts(this.page, { scope: this.scope, pass: passTag }),
    ]);
    const allDiscovered = [...fullGroups, ...fullToasts];

    // Diff: find groups that are new since start()
    const result: ManifestGroup[] = [];

    for (const group of allDiscovered) {
      const key = `${group.groupType}::${group.wrapperType}::${group.label}`;
      if (this.initialGroups.has(key)) continue; // Was already present before recording

      // This group is new — find triggeredBy from the observer/action log
      const groupRole = roleForGroup(group);
      const observedEntry =
        observed.find(e => e.label === group.label) ??
        observed.find(e => e.role !== null && e.role === groupRole) ??
        observed.find(e => e.selector === group.selector);

      const triggeredBy = observedEntry
        ? findTrigger(actions, observedEntry.timestamp)
        : actions.length > 0
          ? actions[actions.length - 1].description // best guess: last action
          : undefined;

      result.push({
        ...group,
        visibility: "exploration",
        discoveredIn: "record",
        ...(triggeredBy ? { triggeredBy } : {}),
      });
    }

    return result;
  }

  /**
   * Stop the MutationObserver and clean up browser globals.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

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
  }
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Infer the ARIA role for a ManifestGroup based on its selector.
 * Used to match observer entries (which record the DOM role attribute)
 * to groups returned by discoverGroups() (which may not expose the role directly).
 */
function roleForGroup(g: ManifestGroup): string | null {
  // Check if selector contains a role pattern like [role="dialog"]
  const m = g.selector.match(/\[role=["']([^"']+)["']\]/);
  if (m) return m[1];
  // Map wrapperType to likely role
  if (g.wrapperType === "dialog") return "dialog";
  if (g.wrapperType === "toast") return "status";
  return null;
}

/**
 * Find the user action that most likely triggered a group appearing.
 * Returns the description of the most recent action before `timestamp`.
 */
function findTrigger(actions: ActionEntry[], timestamp: number): string | undefined {
  let best: ActionEntry | undefined;
  for (const action of actions) {
    if (action.timestamp <= timestamp) {
      if (!best || action.timestamp > best.timestamp) {
        best = action;
      }
    }
  }
  return best?.description;
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
