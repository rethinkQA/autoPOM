/**
 * HandlerRegistry — manages the ordered collection of element handlers
 * used to classify and interact with DOM elements.
 *
 * Extracted from {@link FrameworkContext} to follow the single-responsibility
 * principle. Each registry maintains its own version counter and lazily
 * recomputed caches for detection rules and role fallbacks.
 */

import type { Locator } from "@playwright/test";
import type { ElementHandler, HandlerPosition, DetectRule } from "./handler-types.js";
import type { Logger, AriaRole, IHandlerRegistry } from "./types.js";
import { createDefaultHandlers } from "./default-handlers.js";
import { classifyElement, type SerializedEntry } from "./element-classifier.js";

/**
 * Explicit, stable ordering of ARIA roles probed by `resolveLabeled`
 * when `getByLabel` finds nothing.
 *
 * @internal Exported for testing — not part of the public API.
 */
export const ROLE_PRIORITY: AriaRole[] = [
  "group",
  "radiogroup",
  "listbox",
  "combobox",
  "slider",
  "spinbutton",
  "switch",
  "button",
  "link",
];

/**
 * WAI-ARIA roles supported by Playwright's `getByRole()`.
 * Used for early validation in {@link HandlerRegistry.registerHandler}.
 *
 * @internal
 */
const VALID_ARIA_ROLES: ReadonlySet<string> = new Set([
  "alert", "alertdialog", "application", "article", "banner",
  "blockquote", "button", "caption", "cell", "checkbox", "code",
  "columnheader", "combobox", "complementary", "contentinfo",
  "definition", "deletion", "dialog", "directory", "document",
  "emphasis", "feed", "figure", "form", "generic", "grid",
  "gridcell", "group", "heading", "img", "insertion", "link",
  "list", "listbox", "listitem", "log", "main", "marquee",
  "math", "menu", "menubar", "menuitem", "menuitemcheckbox",
  "menuitemradio", "meter", "navigation", "none", "note",
  "option", "paragraph", "presentation", "progressbar", "radio",
  "radiogroup", "region", "row", "rowgroup", "rowheader",
  "scrollbar", "search", "searchbox", "separator", "slider",
  "spinbutton", "status", "strong", "subscript", "superscript",
  "switch", "tab", "table", "tablist", "tabpanel", "term",
  "textbox", "timer", "toolbar", "tooltip", "tree", "treegrid",
  "treeitem",
]);

// ── HandlerRegistry class ───────────────────────────────────

export class HandlerRegistry implements IHandlerRegistry {
  private _handlers: ElementHandler[];
  /**
   * Structurally enforced fallback handler — used as the catch-all
   * when no specific handler matches. Set once at construction and
   * on {@link resetHandlers}, never discovered by string lookup.
   */
  private _fallback: ElementHandler;
  private _registryVersion = 0;
  private _cachedVersion = -1;
  private _cache: { serialized: SerializedEntry[]; fallback: ElementHandler } | null = null;
  private _roleFallbacksVersion = -1;
  private _roleFallbacks: AriaRole[] = [];

  /**
   * @param loggerProvider — callback returning the current Logger.
   *   Injected so the registry can log warnings without owning the logger.
   * @param fallbackType — the `type` name of the handler that serves as
   *   the catch-all fallback when no specific handler matches.  Looked up
   *   by name (not by position) so reordering `createDefaultHandlers()`
   *   can never silently break the fallback.
   */
  constructor(
    private readonly _loggerProvider: () => Logger,
    private readonly _fallbackType: string = "input",
  ) {
    this._handlers = createDefaultHandlers();
    this._fallback = this._resolveFallback(this._handlers, this._fallbackType);
  }

  /**
   * Find the fallback handler by type name.
   * Throws immediately if the requested type is missing — a loud failure
   * beats a silent mis-classification at runtime.
   */
  private _resolveFallback(handlers: ElementHandler[], type: string): ElementHandler {
    const fb = handlers.find(h => h.type === type);
    if (!fb) {
      throw new Error(
        `HandlerRegistry: fallback handler "${type}" not found in the handler list. ` +
        `Available types: ${handlers.map(h => h.type).join(", ")}.`,
      );
    }
    return fb;
  }

  /** Public read-only view of the handler registry. */
  get handlers(): readonly ElementHandler[] {
    return this._handlers;
  }

  /**
   * Register a custom handler at runtime.
   *
   * The handler is inserted into the registry at the requested position
   * and all derived caches are automatically invalidated.
   */
  registerHandler(
    handler: ElementHandler,
    position: HandlerPosition = "last",
  ): void {
    if (!handler.type?.trim()) {
      throw new Error(
        `registerHandler: handler.type must be a non-empty string.`,
      );
    }
    if (this._handlers.some((h) => h.type === handler.type)) {
      throw new Error(
        `registerHandler: handler with type "${handler.type}" is already registered.`,
      );
    }
    if (typeof handler.set !== "function") {
      throw new Error(
        `registerHandler: handler "${handler.type}" has a non-function \`set\` property (got ${typeof handler.set}). ` +
        `Handlers must provide set and get as functions.`,
      );
    }
    if (typeof handler.get !== "function") {
      throw new Error(
        `registerHandler: handler "${handler.type}" has a non-function \`get\` property (got ${typeof handler.get}). ` +
        `Handlers must provide set and get as functions.`,
      );
    }
    if (!handler.detect || handler.detect.length === 0) {
      throw new Error(
        `registerHandler: handler "${handler.type}" has no detect rules and would never match any element.`,
      );
    }

    for (const rule of handler.detect) {
      if (rule.inputTypes && !rule.tags?.includes("input")) {
        throw new Error(
          `registerHandler: handler "${handler.type}" has a detect rule with inputTypes but tags does not include "input". ` +
            `inputTypes are only checked after a tags match, so this rule would never match. ` +
            `Add tags: ["input"] to the rule.`,
        );
      }
      const hasPrimary = rule.tags || rule.roles || rule.attr;
      if (!hasPrimary) {
        throw new Error(
          `registerHandler: handler "${handler.type}" has a detect rule with no primary criterion ` +
            `(tags, roles, or attr). The rule would never match any element.`,
        );
      }
      // Warn on unrecognised ARIA role names — likely a typo or
      // a role that Playwright's getByRole() doesn't support.
      if (rule.roles) {
        for (const role of rule.roles) {
          if (!VALID_ARIA_ROLES.has(role)) {
            this._loggerProvider().warn(
              `registerHandler: handler "${handler.type}" uses unrecognised ARIA role "${role}". ` +
              `This may be a typo or a role not supported by Playwright's getByRole().`,
            );
          }
        }
      }
      if (rule.requireChild) {
        // P2-232: Validate CSS selector syntax at registration time using
        // Node.js-compatible heuristic checks (document.querySelector is
        // unavailable in Node.js where tests run).
        const sel = rule.requireChild;
        // Check for obviously unbalanced brackets
        const openBrackets = (sel.match(/\[/g) || []).length;
        const closeBrackets = (sel.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) {
          throw new Error(
            `registerHandler: handler "${handler.type}" has a detect rule with an invalid ` +
              `requireChild CSS selector "${sel}" (unbalanced brackets).`,
          );
        }
        // Check for unbalanced parentheses
        const openParens = (sel.match(/\(/g) || []).length;
        const closeParens = (sel.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          throw new Error(
            `registerHandler: handler "${handler.type}" has a detect rule with an invalid ` +
              `requireChild CSS selector "${sel}" (unbalanced parentheses).`,
          );
        }
        // Check for empty selector
        if (!sel.trim()) {
          throw new Error(
            `registerHandler: handler "${handler.type}" has a detect rule with an empty ` +
              `requireChild CSS selector.`,
          );
        }
        // Check for double colons used incorrectly (e.g. th::nth-child)
        if (/::(?!before|after|first-line|first-letter|placeholder|selection|backdrop|marker|spelling-error|grammar-error)/.test(sel)) {
          this._loggerProvider().warn(
            `registerHandler: handler "${handler.type}" has a requireChild selector "${sel}" ` +
              `with a double-colon pseudo-element. Did you mean a single colon for a pseudo-class?`,
          );
        }
      }
    }

    // Defensive clone: prevent silent corruption if the caller later
    // mutates the handler object or its detect rules.
    const cloned: ElementHandler = {
      ...handler,
      expectedValueType: handler.expectedValueType ? [...handler.expectedValueType] : undefined,
      detect: handler.detect.map((rule) => ({
        ...rule,
        tags: rule.tags ? [...rule.tags] : undefined,
        inputTypes: rule.inputTypes ? [...rule.inputTypes] : undefined,
        roles: rule.roles ? [...rule.roles] : undefined,
        ...(rule.attr ? { attr: [...rule.attr] as [string, string] } : {}),
      } as DetectRule)),
    };

    // Freeze the clone (and its detect rules) so that callers who obtain
    // a reference via the public `handlers` getter cannot silently mutate
    // properties without triggering cache invalidation or re-validation.
    // This matches the freeze depth applied to DEFAULT_HANDLERS.
    for (const rule of cloned.detect) Object.freeze(rule);
    Object.freeze(cloned.detect);
    Object.freeze(cloned);

    if (position === "first") {
      this._handlers.unshift(cloned);
    } else if (position === "last") {
      // Insert before the fallback handler so that the catch-all always
      // stays at the very end of the list.  We locate the fallback by
      // reference instead of assuming it is at `length - 1`, because
      // relative insertions (`{ after: … }`) may have moved other
      // handlers past the fallback's original position.
      const fallbackIdx = this._handlers.indexOf(this._fallback);
      if (fallbackIdx !== -1) {
        this._handlers.splice(fallbackIdx, 0, cloned);
      } else {
        this._handlers.push(cloned);
      }
    } else if ("before" in position) {
      const idx = this._handlers.findIndex((h) => h.type === position.before);
      if (idx === -1) {
        throw new Error(
          `registerHandler: no existing handler with type "${position.before}" to insert before.`,
        );
      }
      this._handlers.splice(idx, 0, cloned);
    } else {
      const idx = this._handlers.findIndex((h) => h.type === position.after);
      if (idx === -1) {
        throw new Error(
          `registerHandler: no existing handler with type "${position.after}" to insert after.`,
        );
      }
      this._handlers.splice(idx + 1, 0, cloned);
    }
    this._registryVersion++;
  }

  /**
   * Look up a registered handler by its `type` name.
   * @returns The handler, or `undefined` if no handler with that name exists.
   */
  getHandlerByType(type: string): ElementHandler | undefined {
    return this._handlers.find((h) => h.type === type);
  }

  /**
   * Remove a handler by its `type` name. Returns `true` if found and removed.
   * Invalidates derived caches.
   */
  unregisterHandler(type: string): boolean {
    if (type === this._fallback.type) {
      throw new Error(
        `unregisterHandler: cannot remove the fallback handler ("${this._fallback.type}"). ` +
        `The fallback handler must always remain registered as the catch-all. ` +
        `Call resetHandlers() instead if you want to restore defaults.`,
      );
    }
    const idx = this._handlers.findIndex((h) => h.type === type);
    if (idx === -1) return false;
    this._handlers.splice(idx, 1);
    this._registryVersion++;
    return true;
  }

  /**
   * Restore the handler registry to its built-in defaults.
   * Removes all handlers added via {@link registerHandler} and
   * re-instates the original set.
   */
  resetHandlers(): void {
    this._handlers = createDefaultHandlers();
    this._fallback = this._resolveFallback(this._handlers, this._fallbackType);
    this._registryVersion++;
  }

  /** Lazily recomputed cache of serialised detection rules + fallback handler. */
  private _getCache() {
    if (!this._cache || this._cachedVersion !== this._registryVersion) {
      this._cache = {
        serialized: this._handlers.map((h, idx) => ({ idx, detect: h.detect })),
        fallback: this._fallback,
      };
      this._cachedVersion = this._registryVersion;
    }
    return this._cache;
  }

  /**
   * Classify a DOM element by running the full detection ruleset
   * and returning the matching handler.
   *
   * Delegates to the standalone {@link classifyElement} algorithm
   * (in `element-classifier.ts`) so that detection logic is
   * independently testable and swappable.
   *
   * @param options.fallback — when `true`, fall back to the last
   *   registered handler (generic input) instead of throwing.
   *   Defaults to `false`.
   */
  async detectHandler(
    el: Locator,
    options?: { fallback?: boolean },
  ): Promise<ElementHandler> {
    const { serialized, fallback } = this._getCache();
    return classifyElement(
      el,
      this._handlers,
      serialized,
      fallback,
      this._loggerProvider(),
      options,
    );
  }

  /**
   * Compute (and cache) the role-fallback list from the current handler
   * registry. Automatically recomputes when handlers have been added
   * via {@link registerHandler}.
   */
  getRoleFallbacks(): AriaRole[] {
    if (this._roleFallbacksVersion === this._registryVersion) return this._roleFallbacks;

    const discoveredRoles = new Set(
      this._handlers.flatMap((h) => h.detect.flatMap((d) => d.roles ?? []))
        .filter((r) => VALID_ARIA_ROLES.has(r)),
    );

    this._roleFallbacks = [
      ...ROLE_PRIORITY.filter((r) => discoveredRoles.has(r)),
      ...[...discoveredRoles].filter(
        (r) => !ROLE_PRIORITY.includes(r as AriaRole),
      ),
    ] as AriaRole[];

    this._roleFallbacksVersion = this._registryVersion;
    return this._roleFallbacks;
  }
}
