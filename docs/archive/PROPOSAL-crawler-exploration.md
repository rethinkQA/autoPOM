# Proposal: Crawler Exploration Pass — Discovering Latent DOM Elements

> **Status:** ✅ Decided — human-guided recording (see §11)
> **Created:** 2026-03-19
> **Decided:** 2026-03-19
> **Author:** Staff SDET
> **Relates to:** Phase 11 (Runtime Crawler), [P1-13] skipped tests

---

## 11. Decision: Human-Guided Recording (`crawler record`)

> **Date:** 2026-03-19
> **Supersedes:** §3 (automated exploration), §9 (ARIA-frontier + page-reload), §10 (contract verification)

### Rationale

All three automated approaches (§3, §9, §10) attempt to make a machine guess what a human already knows. The person testing the app already knows "click this button to open the dialog." An automated crawler spends hundreds of lines of heuristic code trying to rediscover that knowledge.

The insight: **automate the observation, not the exploration.** Let the human provide the intelligence (what to click, what's important). Let the tool provide the memory (what appeared, when, triggered by what).

This also prepares for real-world production apps where ARIA may be incomplete, timing is unpredictable, and the tester has no prior knowledge of the app's DOM structure. A human-guided approach works regardless of app quality.

### Design: DOM Flight Recorder

The analogy is an aircraft black box: the black box doesn't fly the plane — it records everything that happens during the flight. The crawler's `record` command doesn't explore the app — the user does. It records every DOM group that materializes during the session.

#### Workflow

```
Step 1:  npx pw-crawl http://localhost:3002              (existing — automated, static)
Step 2:  npx pw-crawl record http://localhost:3002        (new — human clicks, tool watches)
Step 3:  Manifests auto-merge via mergeManifest()         (existing — additive-only)
```

#### What `record` does

1. Launches browser in **headed mode**
2. Injects a **MutationObserver** via `page.addInitScript()` before page load — watches for `GROUP_SELECTOR` matches
3. Injects an **event listener** that logs user actions with timestamps (click X at T)
4. Human uses the app naturally — opens dialogs, triggers toasts, whatever
5. Human closes browser (or Ctrl+C)
6. Tool harvests observer data → converts to `ManifestGroup[]` with `triggeredBy` and `visibility: "exploration"` metadata
7. Merges into existing manifest via `mergeManifest()` — additive-only, existing groups untouched

#### What it produces

Same `manifest.json` format. Extra fields on exploration-discovered groups:

```json
{
  "label": "Product Details",
  "selector": "dialog.product-detail",
  "role": "dialog",
  "visibility": "exploration",
  "triggeredBy": "button[aria-haspopup='dialog']",
  "discoveredIn": "record"
}
```

#### How it fits existing infrastructure

| Existing piece | How `record` uses it |
|---|---|
| `GROUP_SELECTOR` | Reused in MutationObserver to filter relevant DOM additions |
| `extractRawGroups()` | Called on harvested elements to produce structured group data |
| `mergeManifest()` | Merges record output with crawl output — no new merge logic |
| `ManifestGroup` interface | Extended with optional `triggeredBy` + `"exploration"` visibility |
| Emitter (`generate`) | Reads manifest → generates page objects. Exploration groups get factories like any other group |
| Drift-check tests | Automatically cover exploration groups once in the manifest |

#### Action attribution

Since the browser is Playwright-controlled (even in headed mode), every `click`, `keydown`, `mouseenter` event on the page is logged with a timestamp. When the observer captures a new group, the tool correlates: "the last user action before this group appeared was a click on `button.detail-trigger` at T−150ms." This gives `triggeredBy` attribution automatically.

#### Scope of new code

- **New:** ~150 lines — CLI `record` subcommand, observer init script, action logger, harvest-to-manifest converter
- **Modified:** `ManifestGroup` type (add optional `triggeredBy`), `mergeManifest()` (accept `"exploration"` visibility)
- **Unchanged:** crawl, emitter, drift-check, everything else

#### Why this generalizes to production apps

| Challenge | Automated approach | Recording approach |
|---|---|---|
| No ARIA attributes | Fails or needs text heuristics | Human knows what to click |
| Custom components | Needs per-framework dismiss logic | Human opens and closes naturally |
| Multi-step triggers (A → B → C reveals D) | Exponential exploration | Human does it in 3 clicks |
| Hover/scroll/time-based content | Needs separate code per interaction type | Human triggers it naturally |
| Transient elements (toasts, tooltips) | Snapshot may miss them | MutationObserver captures everything that ever existed |

#### Prerequisite

P2-27 (merge key instability) must be fixed first. Any multi-pass work needs a stable identity for groups across passes.

#### Estimated effort

~4 hours implementation + ~1 hour validation across all 7 apps.

---

### Why automated exploration was rejected

The three automated approaches (§3–§10) were evaluated thoroughly. Key reasons for rejection:

1. **Over-engineered for the immediate problem.** 13–17 hours of implementation to resolve 16 skipped tests.
2. **Heuristics rot.** Text-pattern matching, ARIA scanning fallbacks, and dismiss-logic all require ongoing maintenance as component libraries change.
3. **Doesn't generalize.** An approach that depends on good ARIA coverage fails on the very production apps where the tool is most needed.
4. **The human is faster.** Running `record` once per app takes ~30 seconds of clicking. Total effort to resolve all 16 skipped tests: ~5 minutes of human interaction.

The automated exploration work in §3–§10 is preserved below as reference. It may be revisited as an optional "auto-explore" mode for apps with excellent accessibility coverage, layered on top of the recording foundation.

---

## 1. Problem Statement

The crawler discovers page structure by taking a single DOM snapshot at `domcontentloaded`. This works for elements that exist in the initial DOM (headers, forms, tables, nav), but **misses elements that only materialize after user interaction:**

- **Dialogs** — React Portals, Angular CDK overlays, Vuetify `<v-dialog>`, Bits UI `<Dialog.Root>`, Shoelace `<sl-dialog>` all inject their DOM on demand. Only vanilla's `<dialog>` is always present.
- **Toasts** — MUI `<Snackbar>`, Vuetify `<v-snackbar>`, Angular `MatSnackBar`, `react-hot-toast` all conditionally render. Only vanilla's toast `<div>` exists at load time.

This means generated page objects for 6 of 7 apps are missing `dialog()` and `toast()` factories. Users must add them manually. 16 tests are skipped ([P1-13]) because the crawler can't validate what it can't see.

### Why single-pass static discovery is fundamentally insufficient

The problem is not a bug in the crawler's selectors — `dialog` and `[role="dialog"]` are in `GROUP_SELECTOR`. The elements are simply not in the DOM when the snapshot runs. No improvements to selector coverage, timing, or Shadow DOM piercing can fix this. The crawler needs a way to **cause elements to appear, observe them, and catalog them.**

---

## 2. Essence of the Problem

This is not unique to DOM crawling. The general problem is: **discovering things that don't exist until something causes them to exist.**

| Domain | Same Problem | Their Solution |
|--------|-------------|----------------|
| Code coverage | Static analysis can't find runtime-only paths | Instrument the code, then *run* it — observe what executes |
| Fuzz testing | Can't predict inputs that trigger bugs | Generate inputs, watch what code paths light up, steer toward unexplored paths |
| HAR recording | Can't predict network traffic patterns | Don't predict — record during actual sessions |
| Game AI (fog of war) | Can't see the map from one position | Move and observe; build the map incrementally from exploration |
| Google's web crawler | JS-rendered content invisible to HTML parser | Execute the JavaScript in headless Chrome |

Common thread: **stop trying to see everything from a fixed vantage point. Instrument the environment, perform actions, and observe what materializes.**

---

## 3. Proposed Approach: MutationObserver Wiretap + Heuristic Exploration

Combine two mechanisms — one for **observation** (what appeared?) and one for **exploration** (what should we try?).

### 3.1 The Wiretap — MutationObserver

Inject a `MutationObserver` into the page **before it loads** using `page.addInitScript()`. This observer watches `document.body` (with `subtree: true, childList: true`) for any new elements matching `GROUP_SELECTOR` (the same CSS comma-list the crawler already uses for discovery).

```
Timeline:
  ├─ addInitScript()       → MutationObserver installed
  ├─ page.goto()           → observer captures initial DOM (same as pass-1)
  ├─ exploration phase     → observer captures portaled/conditional elements
  └─ page.evaluate()       → harvest observer's accumulated catalog
```

The observer is **passive, continuous, and framework-agnostic.** It doesn't care whether the dialog was injected by a React Portal, Angular CDK, or vanilla DOM API — it just sees nodes being appended to the tree.

Key properties:
- Captures elements regardless of *when* they appear (during load, after click, after timeout)
- Captures elements regardless of *where* they appear (body root, portal container, shadow root)
- Does not interfere with the page's behavior (read-only observation)
- Can be harvested at any time via `page.evaluate()`

### 3.2 The Explorer — Heuristic Trigger Discovery

Instead of requiring a human-authored trigger map, the crawler discovers triggers from **accessibility semantics that already exist in the page:**

**Primary signal: `aria-haspopup`**
All 7 apps use component libraries that emit proper ARIA attributes. MUI Dialog, Vuetify Dialog, Angular CDK Dialog, Bits UI Dialog, Shoelace — they all set `aria-haspopup="dialog"` (or `aria-haspopup="true"`) on their trigger buttons. This is the standardized declaration that means "clicking me spawns an overlay."

**Secondary signals (fallback heuristics):**
- Buttons/links containing text patterns: "Details", "View", "Open", "Show", "Close"
- Elements with `aria-expanded="false"` (expandable controls)
- Elements with `data-dialog-trigger` or similar custom attributes (if present)

**Exploration loop:**
```
for each trigger found by heuristic:
  1. click the trigger
  2. wait for DOM to settle (requestAnimationFrame + short timeout)
  3. (observer captures whatever appeared)
  4. dismiss the overlay (Escape key or click backdrop)
  5. wait for DOM to settle again
  6. move to next trigger
```

After all triggers are exhausted, harvest the observer's full catalog. Everything it captured — whether from initial load or from exploration — gets merged into the manifest via the existing `mergeManifest()`.

### 3.3 How It Fits the Existing Architecture

The crawler already has the infrastructure for this:

| Existing Feature | How It's Used |
|-----------------|---------------|
| `CrawlOptions.pass` | Multi-pass support — pass-1 is static, pass-2 is exploration |
| `mergeManifest()` | Append-only merge — new groups from exploration get added, existing ones preserved |
| `GROUP_SELECTOR` | Reused by the MutationObserver — same selectors, different collection mechanism |
| `discoverGroups()` / `discoverToasts()` | Can be called as a validation step after exploration to cross-check observer results |
| `ManifestGroup.visibility` | Extended: `"static"` (load-time), `"dynamic"` (hidden at load), `"exploration"` (materialized during exploration) |
| `ManifestGroup.discoveredIn` | Already tracks which pass discovered the group |

**New fields for manifest groups discovered via exploration:**
```typescript
interface ManifestGroup {
  // ... existing fields ...
  triggeredBy?: string;    // selector of the element that caused this group to appear
  visibility: "static" | "dynamic" | "exploration";  // new value
}
```

### 3.4 What the Emitter Gains

With exploration-discovered groups in the manifest, the emitter can:
- Generate `dialog()` and `toast()` factories for all 7 apps (not just vanilla)
- Annotate them with a comment: `// Discovered via exploration — triggered by [selector]`
- Remove the `// TODO: add adapter` comments currently emitted for missing elements

---

## 4. Implementation Sketch

### Phase A — MutationObserver Infrastructure

1. Create `src/observer.ts` with functions to:
   - Generate the init script (MutationObserver watching for GROUP_SELECTOR matches)
   - Harvest collected elements via `page.evaluate()`
   - Match collected elements against existing `ManifestGroup` format
2. Add `CrawlOptions.explore?: boolean | ExploreOptions` to opt into exploration
3. Wire observer injection into `crawlPage()` before `page.goto()`

### Phase B — Heuristic Trigger Discovery

1. Create `src/explore.ts` with:
   - `discoverTriggers(page)` — find elements with `aria-haspopup`, expandable controls, keyword-matched buttons
   - `exploreTrigger(page, trigger)` — click, wait, observe, dismiss
   - `exploreAll(page, triggers)` — the outer loop
2. Integrate into `crawlPage()` as an optional step between pass-1 discovery and manifest finalization

### Phase C — Manifest + Emitter Integration

1. Extend `ManifestGroup` with `triggeredBy` and `"exploration"` visibility value
2. Update emitter to handle exploration-discovered groups (generate factories, add annotations)
3. Update drift-check to include exploration-phase groups

### Phase D — Validation

1. Un-skip the 16 `[P1-13]` tests (or replace them with exploration-aware equivalents)
2. Verify exploration discovers dialogs and toasts for all 7 apps
3. Ensure exploration does not produce false positives (noise from transient DOM mutations)

---

## 5. Risks and Open Questions

| Risk | Mitigation |
|------|------------|
| **Exploration changes app state** — clicking buttons may trigger side effects (navigation, form submission) | Prioritize `aria-haspopup` triggers (semantically defined as "opens overlay, doesn't navigate"). Ignore anchor links. Dismiss overlays before next trigger. |
| **MutationObserver noise** — observers see *everything*, not just meaningful groups | Filter on the server side (Playwright context) using the same `GROUP_SELECTOR` matching. Ignore transient DOM (e.g., animation wrappers that appear and disappear). |
| **Shadow DOM boundaries** — MutationObserver on `document.body` doesn't see inside shadow roots | For shadow DOM: either observe `shadowRoot` subtrees (discoverable via the existing BFS traversal), or use a hybrid approach where the observer handles light DOM and the existing `querySelectorAllDeep` handles post-exploration shadow DOM snapshots. |
| **Timing sensitivity** — how long to wait after clicking a trigger? | Use `requestAnimationFrame` + `page.waitForTimeout(300)` as baseline. Could also poll the observer for "no new mutations in the last 200ms" as a stability signal. |
| **Dismissing overlays is framework-specific** | Try generic dismissal in order: Escape key → click backdrop → click close button. Most component libraries respond to at least one. |
| **Non-deterministic toast timing** — toasts auto-dismiss after ~3s | The observer captures the element *when it appears*, regardless of how briefly it exists. Even if the toast auto-dismisses, the observer has already recorded it. This is a fundamental advantage over snapshot-based discovery. |

---

## 6. Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| A — Observer infrastructure | ~4 hours | None |
| B — Heuristic exploration | ~6 hours | Phase A |
| C — Manifest + emitter integration | ~3 hours | Phase B |
| D — Validation + un-skip tests | ~4 hours | Phase C |
| **Total** | **~17 hours** | |

---

## 7. Decision Criteria

This proposal should be adopted if:
- The 16 skipped tests are considered an unacceptable gap in crawler coverage
- Generated page objects are expected to be usable without manual dialog/toast additions
- The framework's "one test suite, any app" thesis extends to codegen (not just runtime)

This proposal can be deferred if:
- Manual page object augmentation is an acceptable workflow
- Crawler coverage is considered "good enough" for static DOM
- Effort is better spent elsewhere (CI/CD, cross-browser, new apps)

---

## 8. Alternatives Considered

### 8.1 Declarative Trigger Map (manual)
User provides a JSON config listing triggers ("click this selector to reveal dialogs"). Simple and explicit, but requires per-app maintenance and defeats the crawler's "zero-config discovery" value proposition.

### 8.2 Pure Snapshot Multi-Pass (no observer)
Run pass-1, perform actions, run pass-2 snapshot. Misses elements that auto-dismiss before the snapshot (toasts). The MutationObserver approach captures *everything that ever existed*, regardless of timing.

### 8.3 Source Code Analysis
Parse framework source to find dialog/toast component usage. Framework-specific, brittle, and doesn't work for vanilla HTML. Violates the project's principle of technology-agnostic discovery.

### 8.4 Accept the limitation
Document that dialogs and toasts require manual page object entries. Lowest effort, but leaves the crawler's value proposition incomplete for the most interesting DOM interaction patterns.

---

## 9. Agent Perspective B — ARIA-Frontier + Page-Reload Approach

> **Source:** Second-pass analysis agent (2026-03-19)
> **Relationship to §3:** Agrees on MutationObserver core, diverges on exploration strategy and dismissal

### 9.1 Reframing the Problem

This is **state space exploration with partial observability** — a solved problem in multiple fields:

| Field | Same Problem | Their Solution |
|-------|-------------|----------------|
| Model checking (TLA+, SPIN) | System has states and transitions; want to explore every reachable state | Systematically try every possible transition from every observed state, record what's new, repeat until nothing new appears |
| Coverage-guided fuzzing (AFL) | Don't know what inputs trigger new code paths | Instrument the target, perform actions, steer toward actions that produce new coverage |
| Frontier-based robotics | Robot mapping unknown building | Identify *frontiers* (boundaries between known and unknown space), move toward them |
| Google rendering pipeline | JS-rendered content invisible to HTML parser | Stop predicting — execute the JS in headless Chrome, observe the result |

Common thread: **stop trying to infer hidden state from a fixed vantage point. Cause state transitions, observe what materializes, and steer toward unexplored boundaries.**

### 9.2 Three Divergences from §3

#### Divergence 1: ARIA-first, not heuristic-first

§3.2 lists `aria-haspopup` as the "primary signal" but immediately discusses text-pattern fallbacks ("Details", "View", "Open"). This perspective inverts the priority hard.

ARIA attributes are the **accessibility contract** — component libraries implement them correctly because screen readers depend on them. Every MUI Dialog trigger emits `aria-haspopup="dialog"`. Every `aria-expanded="false"` element has hidden content. Every `aria-controls="panel-id"` declares a relationship to invisible DOM.

**The page is already telling you what's hidden.** The crawler just isn't listening.

The relevant ARIA frontier markers:
- `aria-haspopup` → "clicking me spawns an overlay"
- `aria-expanded="false"` → "I have collapsed content"
- `aria-controls="X"` where `#X` doesn't exist in DOM → "I reference content that hasn't materialized"

Text heuristics should be a distant fallback for apps with poor ARIA, not a secondary strategy for well-built component library apps.

#### Divergence 2: Page reload between explorations — eliminate the dismiss problem

The hardest engineering problem in §3.2 is dismissing overlays after observation. Escape? Backdrop click? Close button? It's framework-specific and fragile. §5 acknowledges this risk but proposes a try-all-three heuristic.

This perspective sidesteps it entirely: **reload the page between each exploration.**

```
for each trigger:
  goto(url)                    // clean slate
  click(trigger)               // open the hidden thing
  observe(what appeared)       // MutationObserver harvest
  // no dismiss needed — next iteration starts fresh
```

These are tiny apps — page load is ~100ms with Playwright's caching. You trade a few seconds of total crawl time for eliminating an entire category of framework-specific dismiss logic. And you get a cleaner guarantee: each observation starts from a known baseline state, so there's no risk of stacked dialogs or polluted state from a previous interaction.

**Trade-off:** More total wall-clock time. But eliminates ~40% of §5's risk table (overlay dismissal, stacked dialogs, state pollution) and simplifies Phase B from ~6 hours to ~3 hours.

#### Divergence 3: Structural diff, not raw observation

§3.1's MutationObserver captures "everything that appeared." But not all mutations are interesting. Clicking a sort header reorders table rows (attribute/position mutations). Clicking a filter checkbox hides rows (removals). These are state changes to *existing* DOM, not creation of *new* DOM.

What matters is a **structural diff** between pre-click and post-click DOM — specifically: new subtrees rooted at elements matching `GROUP_SELECTOR`. This filters out noise from attribute changes, text updates, and re-parented nodes.

With the page-reload approach, this simplifies further: diff the post-click DOM snapshot against the Pass 1 baseline. Only groups that exist post-click but *not* in Pass 1 are exploration-discovered.

### 9.3 Proposed Architecture (Modified)

```
Pass 1: Static Discovery (exists today — unchanged)
  → snapshot DOM at load → extract groups → baseline manifest

Pass 2: Frontier Discovery (new)
  → scan baseline DOM for ARIA frontier markers
      (haspopup, expanded=false, controls pointing to absent IDs)
  → for each frontier:
      reload page to clean state
      click the frontier element
      wait for DOM to settle
      snapshot DOM, diff against Pass 1 baseline
      record new groups: { triggeredBy, visibility: "exploration" }
  → produce supplemental manifest (additive-only)

Merge: supplemental + baseline
  → new groups added, existing groups never modified
  → exploration is opt-in and non-destructive
  → if exploration produces garbage for an app, disable it without regressing
```

### 9.4 Speculative: CSS Rule Orphan Detection

Elements that don't exist yet often have CSS rules already loaded for them. Stylesheets bundled by component libraries contain rules for dialog backdrops, toast containers, snackbar animations — all targeting selectors that *don't match any current DOM node.*

Approach:
1. Enumerate all CSS selectors in the page's loaded stylesheets
2. Test each against the current DOM
3. Selectors with zero matches are "orphans" — hints about DOM that will exist later

Example: `.MuiDialog-root` in a stylesheet with no matching element = strong signal a dialog will appear.

This wouldn't replace the exploration pass, but could **validate** exploration results or **suggest** where to look when ARIA signals are missing. This technique is not commonly used for DOM discovery — it's a novel application of existing browser APIs (`document.styleSheets`, `CSSStyleSheet.cssRules`, `document.querySelectorAll(selector).length === 0`).

**Status:** Speculative. Not part of the core proposal. Noted for future investigation.

### 9.5 Revised Effort Estimate

| Phase | Effort | vs. §6 | Notes |
|-------|--------|--------|-------|
| A — Observer infrastructure | ~4 hours | Same | MutationObserver + harvest — unchanged |
| B — ARIA frontier + page-reload exploration | ~3 hours | −3h | No dismiss logic, no text heuristics |
| C — Manifest + emitter integration | ~3 hours | Same | Supplemental manifest additive merge |
| D — Validation + un-skip tests | ~3 hours | −1h | Cleaner baseline diff = less noise to debug |
| **Total** | **~13 hours** | **−4h** | |

### 9.6 Strategic Note

The real question isn't technical — it's priority. CI/CD (Deferred-1) prevents entire categories of regressions across the whole project. The exploration pass resolves 16 skipped tests in one subsystem. Both are legitimate. But they serve different goals: CI protects what exists; exploration completes what's missing.

---

## 10. Agent Perspective C — Contract Verification, Not Exploration

> **Source:** Third-pass analysis agent (2026-03-19)
> **Relationship to §3 and §9:** Agrees with §9's ARIA-first and page-reload stance, but reframes the *conceptual model* from exploration to contract verification. Disagrees with §3's heuristic fallback strategy.

### 10.1 Reframing: The Page Is Not a Black Box

Both §3 and §9 frame the page as something opaque that must be explored — probed until hidden elements reveal themselves. This perspective argues the framing is wrong: **the page is already declaring its hidden content through ARIA attributes.** The problem is not undiscoverability; it's that the crawler doesn't read the self-description that's already there.

#### The capability discovery analogy

The closest analogy is not fuzz testing, code coverage, or robot exploration. It is **capability discovery protocols** — systems where one party declares its capabilities to another through a structured manifest, and the other party reads the manifest instead of probing:

| Domain | How they discover hidden capabilities |
|--------|--------------------------------------|
| Network printers (mDNS/IPP) | Ask the device what it supports — it responds with a capability manifest |
| USB devices | Device descriptor tells the OS every interface, endpoint, and transfer type before any data flows |
| REST APIs (OpenAPI/Swagger) | Schema endpoint declares all routes, parameters, and response shapes — no probing needed |
| GraphQL | Introspection query returns the entire type system |
| Bluetooth LE | GATT service/characteristic advertisements declare what the device exposes |
| DNS SRV records | Declare which services exist on which ports before you connect |

Common thread: **don't probe the black box — read its self-description.**

ARIA attributes are the web page's capability manifest. `aria-haspopup="dialog"` on a button is the DOM equivalent of a USB device descriptor saying "I have a bulk transfer endpoint." It's not a hint or a heuristic — it's a standardized interface contract that component libraries implement because screen readers depend on it. MUI, Vuetify, Angular CDK, Bits UI, Shoelace — all of them emit these attributes. They have to. It's the accessibility contract.

#### Why this reframing matters practically

"Exploration" implies open-ended searching with uncertain results. "Contract verification" implies:

1. **You know what to look for before you start.** The ARIA scan produces a finite list of declared capabilities.
2. **You know what to activate.** Each frontier marker names the trigger and what it claims to produce.
3. **You know what success looks like.** If `aria-haspopup="dialog"` is declared, activating the trigger should produce a `dialog` or `[role="dialog"]` element.
4. **You can detect contract violations.** If a trigger declares `aria-haspopup="dialog"` but nothing appears after activation, that's a bug in the app — useful diagnostic information, not an exploration dead end.

Exploration-framed systems ask: "What can we find?" Contract-verification-framed systems ask: "Does reality match the declared interface?" The second question is more bounded, more testable, and more aligned with what the emitter needs.

### 10.2 The Three-Layer Design

#### Layer 1 — Read the manifest (ARIA frontier scan)

After pass-1 static discovery, scan the DOM for ARIA attributes that declare hidden content. These are treated as the **exclusive** trigger list — no text-pattern heuristics, no keyword matching:

- `aria-haspopup` → "Activating me produces an overlay (dialog, menu, listbox, tree, grid)"
- `aria-expanded="false"` → "I control collapsed content"
- `aria-controls="X"` where `#X` is absent → "I reference content not yet in the DOM"

This is a single `page.evaluate()` call that returns a list of `{ selector, ariaContract, accessibleName }` objects. On the current 7 apps, this produces ~2–3 triggers per page (dialog trigger, possibly an accordion or expandable section). Not dozens.

**Why no text heuristics?** §3.2 proposes secondary signals: buttons containing "Details", "View", "Open", "Show". This perspective drops them entirely:
- They produce false positives (a "View" link might navigate, not open an overlay).
- They're language-dependent (won't work if an app uses i18n).
- They're unnecessary — every component library in the project's matrix already emits correct ARIA attributes.
- Text heuristics are a fallback for pages with *bad* accessibility. These apps were built with accessibility as a requirement (§6.4). If the ARIA attributes are missing, that's a bug in the app to fix, not a gap for the crawler to work around.

#### Layer 2 — Verify the claims (targeted activation)

For each ARIA-declared trigger, verify its contract by activation:

```
for each frontier in ariaFrontierScan(page):
  await page.goto(url)               // clean state (page-reload isolation, per §9.2)
  await page.click(frontier.selector) // activate the declared trigger
  await settleDom()                   // wait for mutations to stop
  const postClickGroups = snapshot()  // same GROUP_SELECTOR-based snapshot as pass-1
  const newGroups = diff(postClickGroups, pass1Baseline)
  record(newGroups, { triggeredBy: frontier.selector, visibility: "exploration" })
```

This is explicitly *not* blind exploration. The crawler activates only elements that *declare* they have hidden content. It knows what to expect (a dialog, a menu) and can validate the result.

The page-reload approach (§9.2) is correct: it eliminates dismiss logic, stacked overlay problems, and state pollution. These apps load in ~100ms — the wall-clock overhead is negligible.

#### Layer 3 — Catch undeclared side effects (observation net)

Toasts are the hard case. No ARIA attribute on the "Add to Cart" button declares "I also spawn a toast." Toasts are fire-and-forget side effects — they appear, exist briefly, and auto-dismiss. No accessibility attribute announces them in advance because they're not triggered by a user's explicit intent to reveal content; they're feedback from an action.

The MutationObserver (§3.1) handles this, but scoped to a specific interaction:

1. The "Add to Cart" button was already discovered in pass-1 as an `action-button`.
2. The crawler knows (from pass-1) which elements are action buttons.
3. During Layer 2, while processing ARIA frontiers, the MutationObserver is already running — it captures *everything* that appears, including toasts triggered by unrelated interactions on the same page.
4. **Additionally:** after ARIA frontier verification, activate known action buttons (already cataloged in pass-1) once each, with the observer running. This catches toast-type side effects that no ARIA attribute declares.

The key insight: toasts don't need ARIA frontier triggers because the elements that *cause* toasts are already known from pass-1. The observer just needs to be running when those elements are activated.

### 10.3 CSS Orphan Detection as Validation Signal

§9.4 proposes CSS orphan detection as speculative. This perspective promotes it to a **validation signal** — not a discovery mechanism, but a confidence booster:

After exploration discovers a dialog via ARIA-triggered activation:
1. Enumerate all CSS selectors in the page's loaded stylesheets (`document.styleSheets` → `CSSStyleSheet.cssRules`)
2. Test each against the *pass-1 baseline DOM* (before exploration)
3. Orphaned selectors (zero matches) that target the *exploration-discovered element* are confirmatory evidence

Example flow:
- ARIA scan finds `button[aria-haspopup="dialog"]`
- Activation produces a `.MuiDialog-root` element
- CSS orphan scan confirms `.MuiDialog-root` existed as an unmatched rule in pass-1
- Confidence: **high** — the dialog is real, not a transient animation artifact

This adds ~10 lines of code and ~50ms per page. It's cheap insurance against false positives from MutationObserver noise.

### 10.4 What This Design Does Not Do

- **Does not explore randomly.** Activates only ARIA-declared triggers and known action buttons. No text-pattern scanning.
- **Does not attempt to dismiss anything.** Page reload between activations (per §9.2).
- **Does not require per-app configuration.** ARIA attributes are framework-agnostic. MUI Dialog, Angular CDK Dialog, Vuetify Dialog, Bits UI Dialog, Shoelace Dialog all emit `aria-haspopup` on their triggers.
- **Does not run on pages with bad ARIA and guess.** If a trigger has no ARIA declaration, it's invisible to this system. The fix is to add ARIA to the app, not to add heuristics to the crawler.
- **Does not replace the MutationObserver proposal.** Uses it, but scoped to verification rather than open-ended observation.

### 10.5 Effort Estimate

| Phase | Effort | Notes |
|-------|--------|-------|
| A — ARIA frontier scanner (`page.evaluate()` returning trigger list) | ~2 hours | Single evaluate call, typed return, unit-testable |
| B — MutationObserver + page-reload activation loop | ~4 hours | Observer from §3.1, reload isolation from §9.2, structural diff from §9.3 |
| C — Manifest integration (`triggeredBy`, `"exploration"` visibility) | ~2 hours | Extends existing `mergeManifest()` — additive only |
| D — Emitter integration (generate dialog/toast factories from discoveries) | ~2 hours | Template already exists, needs exploration-group handling |
| E — CSS orphan validation signal (optional) | ~1 hour | Confirmatory, not blocking |
| F — Validation + un-skip 16 tests | ~2 hours | Clean baseline diff = less noise |
| **Total** | **~13 hours** | ~10 hours without CSS orphan validation |

### 10.6 Synthesis Across All Three Perspectives

| Dimension | §3 (Original) | §9 (Perspective B) | §10 (Perspective C) |
|-----------|---------------|--------------------|--------------------|
| **Core metaphor** | Exploration (fuzz testing, fog of war) | State space exploration (model checking, frontier robotics) | Capability discovery (device descriptors, API schemas) |
| **Trigger discovery** | ARIA primary + text heuristics secondary | ARIA-first, hard inversion | ARIA-only — no text heuristics |
| **Observation** | MutationObserver (continuous, raw) | MutationObserver + structural diff | MutationObserver (scoped to activation) + CSS orphan validation |
| **Overlay dismissal** | Try Escape → backdrop → close button | Page reload (eliminate the problem) | Page reload (agrees with §9) |
| **Toast strategy** | Observer captures during any exploration | Same as §3 | Targeted: activate known action buttons from pass-1, observer captures side effects |
| **Framing** | "What can we find?" | "What new states can we reach?" | "Does reality match the declared interface?" |
| **Effort** | ~17 hours | ~13 hours | ~13 hours (~10 without CSS orphan) |
| **Risk profile** | Highest — heuristics can misfire, dismiss logic is fragile | Medium — page-reload simplifies, but still explores broadly | Lowest — bounded by ARIA declarations, no heuristics, no dismiss logic |

### 10.7 Recommendation

1. **Ship CI first** (Deferred-1). It protects 2,088 tests. This protects 16.
2. **When ready, implement ARIA frontier scan + page-reload verification.** The three perspectives converge on MutationObserver + page-reload. They diverge on trigger discovery strategy. ARIA-only is the most bounded, least risky option for apps built with component libraries that emit proper accessibility attributes.
3. **Defer text heuristics** until an app is added that lacks proper ARIA (unlikely with mainstream component libraries). If needed, add them as a fallback layer — not as a default strategy.
4. **CSS orphan validation is optional polish.** Implement it if false positives from MutationObserver noise become a problem during Phase F validation. Skip it if exploration results are clean without it.

---

*This is a proposal draft. Perspectives welcome. No implementation should begin until a decision is made.*
