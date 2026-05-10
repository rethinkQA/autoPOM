/**
 * Heuristic exploration planner.
 *
 * Finds visible, replayable actions from the current DOM and applies a
 * conservative safety model. AI/MCP planners can be layered on top of this
 * without changing the graph or manifest pipeline.
 */

import type { Page } from "playwright";
import type {
  ActionLocatorHint,
  ExplorationActionCandidate,
  ExplorationActionKind,
  ExplorationActionRisk,
  ExploreStrategy,
} from "./explore-types.js";

// ── Safety patterns ─────────────────────────────────────────

/** Default destructive action labels skipped by every strategy. */
export const DEFAULT_DENY_ACTION_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bdelete\b/i,
  /\bremove\b/i,
  /\barchive\b/i,
  /\bdestroy\b/i,
  /\bcancel subscription\b/i,
  /\bpurchase\b/i,
  /\bpay\b/i,
  /\bcheckout\b/i,
  /\bsubmit order\b/i,
  /\bconfirm\b/i,
  /\breset\b/i,
  /\blog\s*out\b/i,
  /\bsign\s*out\b/i,
]);

/** Labels that are usually safe exploration affordances. */
export const DEFAULT_SAFE_ACTION_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bopen\b/i,
  /\bview\b/i,
  /\bdetails?\b/i,
  /\bsearch\b/i,
  /\bfilter\b/i,
  /\bsort\b/i,
  /\bexpand\b/i,
  /\bcollapse\b/i,
  /\bnext\b/i,
  /\bprevious\b/i,
  /\bprev\b/i,
  /\bmenu\b/i,
  /\bmore\b/i,
]);

/** Options for visible action extraction. */
export interface ExtractActionCandidatesOptions {
  /** Limit action extraction to a CSS selector. */
  scope?: string;

  /** Exploration strategy used to filter candidates. */
  strategy?: ExploreStrategy;

  /** Additional deny patterns. */
  denyActionPatterns?: RegExp[];

  /** Additional allow patterns. */
  allowActionPatterns?: RegExp[];
}

/** Classify the risk of an action candidate from its visible label and locator metadata. */
export function classifyActionRisk(
  label: string,
  locator: ActionLocatorHint = {},
  kind: ExplorationActionKind = "click",
  allowActionPatterns: readonly RegExp[] = [],
  denyActionPatterns: readonly RegExp[] = [],
): ExplorationActionRisk {
  const text = label.trim();
  const deny = [...DEFAULT_DENY_ACTION_PATTERNS, ...denyActionPatterns];
  if (deny.some((pattern) => pattern.test(text))) return "destructive";

  if (allowActionPatterns.some((pattern) => pattern.test(text))) return "safe";

  if (locator.href) {
    return locator.isInternalHref === false ? "unknown" : "navigation";
  }

  if (kind === "fill" || kind === "select" || kind === "submit") return "mutation";

  const role = locator.role?.toLowerCase();
  if (role === "tab" || role === "menuitem" || role === "option" || role === "combobox") return "safe";

  if (locator.selector?.startsWith("summary")) return "safe";

  if (DEFAULT_SAFE_ACTION_PATTERNS.some((pattern) => pattern.test(text))) return "safe";

  return "unknown";
}

/** Extract visible action candidates from the current page. */
export async function extractActionCandidates(
  page: Page,
  options: ExtractActionCandidatesOptions = {},
): Promise<ExplorationActionCandidate[]> {
  const raw = await page.evaluate(({ scope }: { scope: string | undefined }) => {
    type RawCandidate = {
      kind: ExplorationActionKind;
      label: string;
      locator: ActionLocatorHint;
      reason: string;
      signature: string;
    };

    const root = scope ? document.querySelector(scope) ?? document.body : document.body;
    const clickableSelector = [
      "a[href]",
      "button",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='tab']",
      "[role='menuitem']",
      "[role='option']",
      "[role='combobox']",
      "[aria-haspopup]",
      "select",
    ].join(", ");
    // Fill-kind: text-ish inputs and textareas that the agent can type into.
    // We match broadly here and reject non-fillable types in `isFillable`.
    const fillableSelector = ["input", "textarea", "[role='textbox']", "[role='searchbox']"].join(", ");
    const selector = `${clickableSelector}, ${fillableSelector}`;

    function cssEscape(value: string): string {
      return (globalThis.CSS?.escape ?? ((s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "\\$&")))(value);
    }

    function isVisible(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function textOf(el: Element): string {
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;

      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ")
          .trim();
        if (text) return text;
      }

      const title = el.getAttribute("title")?.trim();
      if (title) return title;

      // For button-style inputs (`type="submit" | "button" | "reset"`), the
      // visible text comes from the `value` attribute. Resolve those FIRST,
      // before falling into the fillable-label chain — otherwise an
      // `<input type="submit" id="login-button" value="Login">` would
      // erroneously surface as "login-button" (its id) instead of "Login"
      // (its visible text).
      if (el instanceof HTMLInputElement) {
        const inputType = (el.getAttribute("type") || "text").toLowerCase();
        if (["submit", "button", "reset"].includes(inputType)) {
          const value = el.value?.trim();
          if (value) return value;
        }
      }

      // <label for="id">…</label><input id="id"> — common pattern for fillable
      // inputs without aria-label. Used for both inputs and textareas.
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.id) {
        const labelEl = document.querySelector(`label[for="${el.id.replace(/"/g, '\\"')}"]`);
        const labelText = labelEl?.textContent?.replace(/\s+/g, " ").trim();
        if (labelText) return labelText;
      }

      // Wrapping <label><input/></label> form.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const wrappingLabel = el.closest("label");
        if (wrappingLabel) {
          // Strip the input's own value/text by cloning and removing inputs.
          const clone = wrappingLabel.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("input, textarea, select").forEach((n) => n.remove());
          const labelText = clone.textContent?.replace(/\s+/g, " ").trim();
          if (labelText) return labelText;
        }
      }

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const placeholder = el.getAttribute("placeholder")?.trim();
        if (placeholder) return placeholder;
        const name = el.getAttribute("name")?.trim();
        if (name) return name;
        // Angular: formControlName="email" — common when there's no <label for>.
        const formCtrl = el.getAttribute("formcontrolname")?.trim();
        if (formCtrl) return formCtrl;
        // Last-ditch fallbacks so fillable inputs are never anonymous: id, then
        // synthesized label from the input type (e.g. "email input").
        if (el.id) return el.id;
        const type = el.getAttribute("type")?.trim();
        if (type) return `${type} input`;
        return "input";
      }

      if (el instanceof HTMLButtonElement) {
        const value = el.value?.trim();
        if (value) return value;
      }

      return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    }

    function isFillable(el: Element): boolean {
      if (el instanceof HTMLTextAreaElement) return !el.disabled;
      if (el instanceof HTMLInputElement) {
        if (el.disabled) return false;
        const type = (el.getAttribute("type") || "text").toLowerCase();
        return !["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image"].includes(type);
      }
      const role = el.getAttribute("role")?.toLowerCase();
      return role === "textbox" || role === "searchbox";
    }

    function roleOf(el: Element): string | undefined {
      const explicit = el.getAttribute("role")?.trim();
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button" || tag === "summary") return "button";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "search") return "searchbox";
        return "textbox";
      }
      return undefined;
    }

    function uniqueSelector(el: Element): string {
      if (!(el instanceof HTMLElement)) return el.tagName.toLowerCase();

      // Pick whichever test-id attribute the element actually has. Sites
      // standardize on one of these — building `[data-testid=…]` when the
      // attribute is `data-test` produces a selector that matches nothing.
      for (const attr of ["data-testid", "data-test", "data-cy"]) {
        const val = el.getAttribute(attr);
        if (val) return `[${attr}="${val.replace(/"/g, "\\\"")}"]`;
      }

      if (el.id) return `#${cssEscape(el.id)}`;

      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body && parts.length < 5) {
        const tag = current.tagName.toLowerCase();
        let part = tag;
        const role = current.getAttribute("role");
        const aria = current.getAttribute("aria-label");
        if (role) part += `[role="${role.replace(/"/g, "\\\"")}"]`;
        if (aria) part += `[aria-label="${aria.replace(/"/g, "\\\"")}"]`;

        const parent: HTMLElement | null = current.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((child: Element) => child.tagName === current!.tagName);
          if (sameTag.length > 1) {
            part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
          }
        }

        parts.unshift(part);
        current = parent;
      }

      return parts.join(" > ");
    }

    function testIdOf(el: Element): string | undefined {
      return el.getAttribute("data-testid") ?? el.getAttribute("data-test") ?? el.getAttribute("data-cy") ?? undefined;
    }

    function hrefInfo(el: Element): { href?: string; isInternalHref?: boolean } {
      if (!(el instanceof HTMLAnchorElement) || !el.href) return {};
      try {
        const target = new URL(el.href, location.href);
        return { href: target.href, isInternalHref: target.origin === location.origin };
      } catch {
        return { href: el.getAttribute("href") ?? undefined, isInternalHref: false };
      }
    }

    const candidates: RawCandidate[] = [];
    const seen = new Set<string>();

    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (!isVisible(el)) continue;
      const label = textOf(el);
      if (!label) continue;

      const role = roleOf(el);
      const selectorValue = uniqueSelector(el);
      const href = hrefInfo(el);
      const locator: ActionLocatorHint = {
        ...(role ? { role } : {}),
        name: label,
        text: label,
        ...(testIdOf(el) ? { testId: testIdOf(el) } : {}),
        selector: selectorValue,
        ...href,
      };
      const fillable = isFillable(el);
      const kind: ExplorationActionKind = fillable
        ? "fill"
        : href.href
        ? "navigate"
        : "click";
      const signature = [kind, role ?? "", label.toLowerCase(), href.href ?? selectorValue].join("::");
      if (seen.has(signature)) continue;
      seen.add(signature);

      candidates.push({
        kind,
        label,
        locator,
        reason: `visible ${role ?? el.tagName.toLowerCase()} ${fillable ? "input" : "action"}`,
        signature,
      });
    }

    return candidates;
  }, { scope: options.scope });

  const candidates = raw.map((candidate) => ({
    ...candidate,
    risk: classifyActionRisk(
      candidate.label,
      candidate.locator,
      candidate.kind,
      options.allowActionPatterns,
      options.denyActionPatterns,
    ),
  }));

  return candidates.filter((candidate) => isAllowedByStrategy(candidate, options.strategy ?? "conservative"));
}

function isAllowedByStrategy(candidate: ExplorationActionCandidate, strategy: ExploreStrategy): boolean {
  if (candidate.risk === "destructive") return false;
  if (candidate.locator.href && candidate.locator.isInternalHref === false) return false;

  switch (strategy) {
    case "conservative":
      return candidate.risk === "safe" || candidate.risk === "navigation";
    case "balanced":
      return true;
    case "aggressive":
      return true;
    default:
      return false;
  }
}
