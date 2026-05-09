# autoPOM MCP / Agentic Exploration Plan

> Status note: This file was created so external coding agents can read the plan directly from the repository. It mirrors the repository-memory plan and adds the current implementation status after commit `cbfcf9c` (`Add autonomous crawler exploration mode`).

## Core recommendation

Do **not** replace the crawler with Playwright MCP.

Use a hybrid architecture:

- MCP / AI / heuristics explore the app and find reachable states.
- The crawler records normalized discoveries.
- Manifests remain the source of truth.
- The emitter generates deterministic page objects.
- Drift detection stays deterministic, with optional agent-assisted repair.

Preferred pipeline:

```text
MCP / AI / heuristics
  -> exploration graph
  -> crawler discovery
  -> manifest
  -> deterministic emitter
  -> page objects
  -> deterministic drift replay
```

## Why not pure MCP -> page objects

Pure MCP generation is attractive for unknown apps, but risky as the stable product path:

- Agent decisions can vary run-to-run.
- Directly generated page object code may hallucinate framework APIs.
- CI drift checks become harder to make deterministic.
- Cost/latency increases because exploration requires many model calls.
- Reviewability is weaker than manifest + generated source.

MCP should help discover states, not own final artifacts.

## Current architecture to preserve

The crawler architecture has strong separation:

- `crawlPage()` creates manifests.
- `diffPage()` compares live DOM to a manifest.
- `AiProvider` analyzes page structure from DOM/a11y/screenshot.
- `emitPageObject()` and `emitMultiRoute()` generate source from manifests.
- `diffPageObjects()` detects generated page object drift.

Keep these as stable primitives.

## Main missing capability

The gap is not lack of AI. The gap is autonomous multi-step exploration:

- Which buttons should be clicked?
- Which route branches should be followed?
- Which dialogs, drawers, menus, tabs, accordions, and toasts exist?
- Which API calls are triggered by which actions?
- Can changed apps be refreshed without manually walking every state?

## Current implementation status

The next stable slice after `cbfcf9c` adds **deterministic graph replay drift detection** (`pw-crawl drift <url> --graph ... --manifests ...`) and the locator strategy split (`selectLocatorStrategy` / `resolveActionLocator` shared between Playwright and replay).

The slice after that wires **Slice 1 of MCP integration: action channel only**. `--mcp` on `explore`/`drift` spawns Microsoft's `@playwright/mcp` over stdio, attaches it to the same Chromium instance via CDP, and routes `goto`/`click`/`hover` through MCP tools. Discovery (`crawlPage`, `extractActionCandidates`) still runs against the co-attached Playwright `Page`.

**Slice 2: AI-guided exploration via tool-use** lands `--ai-agent` on `explore`. The agent (`createAnthropicAgent`) gets a small constrained tool surface — `click_candidate(index)`, `click_locator({role,name,...})`, `navigate(url)`, `stop({reason})` — and picks the next action each turn from an observation that includes URL, title, manifest groups already discovered, the visible action candidates with indices, recent history, and the action budget. Decisions translate into existing `ExplorationAction` records so the manifest/graph pipeline is unchanged. The loop is transport-agnostic — pair it with `PlaywrightBrowserController` for direct Playwright or `--mcp` for the MCP path.

Slice 2 is non-deterministic by design — meant for nightly/manual runs and assisted-repair flows, not the CI replay path. CI continues using the heuristic planner + drift replay. Other AI providers (OpenAI / Ollama) for tool-use are a future slice.

Optional peer deps (resolved lazily, only when `--mcp` is on):

```text
npm install --save-optional @playwright/mcp @modelcontextprotocol/sdk
```

Slice 2 (AI agent) only needs `ANTHROPIC_API_KEY` — the agent uses raw `fetch`, no SDK dep.

**Slice 2 polish: prompt caching** is enabled by default. The agent sends the system prompt as a text-block array with `cache_control: { type: "ephemeral" }`, so Anthropic caches the cumulative prefix (tools + system) up to that breakpoint. After the first turn, subsequent turns within the 5-minute TTL are billed at ~0.1x base rate for the cached prefix. Disable via `AnthropicAgentOptions.disablePromptCache`. The CLI logs per-turn token usage and a final cache hit-rate when `--ai-agent` is on.

**Slice 3: auth support** lands `--auth-state <file>` on `explore` and `drift`. The flag accepts a Playwright `storageState` JSON file. On the direct-Playwright path it's passed to `browser.newContext({ storageState })`; on the MCP path it's forwarded to `@playwright/mcp` via its `--storage-state` flag so cookies and localStorage load before any navigation. The file path is validated upfront so missing paths fail fast. Sensitive-value redaction in the graph (the plan's "redact sensitive values" item) is deferred — the graph stores `page.url()` as-is, which the app controls; users who need redaction can post-process the graph or run `--scope` to limit observation.

**Slice 4: assisted repair** lands `pw-crawl drift --repair --repair-output <file>`. After the deterministic replay produces a `DriftReport`, the repair pass walks each failed path, re-replays it up to the failure point, gathers the current visible candidates, and asks `IRepairAgent` (currently `createAnthropicRepairAgent`) for a replacement. The agent picks one of: `replace_with_candidate(index)`, `replace_with_locator({...})`, or `give_up({reason})`. Suggestions are written to a side file (`repair-suggestions.json`) for human review — the saved graph and manifests are never silently mutated. CI can still gate on drift exit codes; users apply suggested patches manually.

Commit `cbfcf9c` implemented the first stable slice:

- `pw-crawl explore` CLI mode.
- `ExploreOptions`, `ExplorationGraph`, states, actions, and transitions.
- `IBrowserController` abstraction.
- `PlaywrightBrowserController` direct Playwright implementation.
- Heuristic action extraction and safety classification.
- `explorePage()` / `exploreWithController()` orchestration.
- Route manifest merging from explored states.
- Optional exploration metadata in manifests.
- Basic `--check` support for graph/manifests/generated pages.
- Unit tests for graph creation and action-risk classification.

Important current files:

- `tools/crawler/src/explore.ts`
- `tools/crawler/src/explore-types.ts`
- `tools/crawler/src/explore-planner.ts`
- `tools/crawler/src/browser-controller.ts`
- `tools/crawler/bin/pw-crawl.ts`
- `tools/crawler/tests/unit/explore.spec.ts`

Validation already run for the first slice:

```text
cd tools/crawler
npx tsc --noEmit --pretty
npm run test:unit
npm run build
node dist/bin/pw-crawl.js explore <inline-data-url> --max-depth 1 --max-actions 1 --no-observe-network -o <tmpdir>
node dist/bin/pw-crawl.js explore <same-inline-data-url> --max-depth 1 --max-actions 1 --no-observe-network -o <tmpdir> --check
```

## Target architecture

Add optional autonomous and MCP-backed exploration around the existing manifest pipeline.

High-level flow:

```text
pw-crawl explore
  -> ExplorationPlanner
  -> BrowserController
  -> StateObserver
  -> ManifestBuilder
  -> existing emitter
```

Important abstractions:

- `BrowserController`: browser action/snapshot abstraction.
- `PlaywrightBrowserController`: direct Playwright implementation.
- `McpBrowserController`: optional experimental MCP-backed implementation.
- `ExplorationPlanner`: proposes/ranks actions.
- `ExplorationGraph`: records states, actions, transitions, and discoveries.

Start with direct Playwright. Add MCP as an adapter behind an experimental flag.

## Exploration graph

The graph should remain separate from the manifest.

The manifest answers: what reusable page object surfaces exist?

The graph answers: how were those surfaces discovered?

Suggested entities:

### `ExplorationState`

- `id`
- `url`
- `routeTemplate`
- `title`
- `domHash`
- `ariaHash`
- `screenshotHash` or equivalent visual hash later
- `visibleActionCount`
- `manifestGroupKeys`
- `discoveredAt`
- `enteredByActionId`

### `ExplorationAction`

- `id`
- `stateId`
- `kind`: `click`, `fill`, `select`, `press`, `hover`, `navigate`, `submit`
- `label`
- `role`
- `selector`
- `locatorHint`
- `reason`
- `risk`: `safe`, `navigation`, `mutation`, `destructive`, `unknown`
- `status`: `candidate`, `attempted`, `succeeded`, `failed`, `skipped`

### `ExplorationTransition`

- `fromStateId`
- `actionId`
- `toStateId`
- `navigation`
- `newGroups`
- `newApiDependencies`
- `newActionNavigations`
- `errors`

## CLI design

Existing first-slice command:

```text
pw-crawl explore <url> [options]
```

Implemented or planned options:

- `-o, --output <dir>`: output graph, manifests, and page objects.
- `--manifest-output <dir>`: output manifests only.
- `--pages-output <dir>`: output page objects only.
- `--graph-output <file>`: write exploration graph JSON.
- `--max-depth <n>`.
- `--max-actions <n>`.
- `--max-routes <n>`.
- `--max-rescans <n>`.
- `--strategy conservative|balanced|aggressive`.
- `--ai-provider openai|anthropic|ollama`.
- `--ai-model <model>`.
- `--mcp`: future MCP-backed browser controller.
- `--no-mcp`: direct Playwright controller.
- `--headed`.
- `--confirm-actions`: planned.
- `--deny-action <pattern>`: planned.
- `--allow-action <pattern>`: planned.
- `--auth-state <file>`: planned.
- `--record-network`: currently behavior is covered through existing network observation flags; naming may evolve.
- `--check`.

Default strategy should remain `conservative`.

## Planner design

Add an explicit planner interface as the next refinement:

```text
proposeActions(state, context): Promise<ActionCandidate[]>
rankActions(actions, graph): Promise<ActionCandidate[]>
shouldStop(graph, budgets): boolean
```

Implementations:

1. `HeuristicPlanner`
   - deterministic and cheap
   - finds visible interactive elements
   - classifies risk by role/text
   - suitable for CI-safe exploration

2. `AiPlanner`
   - uses existing AI provider style
   - ranks actions and explains why
   - still constrained by external safety rules
   - falls back to heuristic planner

3. `McpBrowserController` / future MCP planner
   - experimental browser-control adapter
   - should produce the same manifest and graph output as direct Playwright

## Manifest integration

Each explored state should reuse existing discovery logic:

- `discoverGroupsWithAi()`
- `discoverGroups()`
- `discoverToasts()`
- `mergeManifest()`
- `NetworkObserver`
- `emitPageObject()`
- `emitMultiRoute()`

For every state:

1. Observe current page.
2. Run discovery.
3. Attach `triggeredBy` metadata where available.
4. Merge into route manifest.
5. Record transition in exploration graph.

Optional manifest schema additions, already started:

- `ManifestGroup.stateId?: string`
- `CrawlerManifest.routeTemplate?: string`
- `CrawlerManifest.exploration?: { graphFile?: string; stateIds?: string[]; actionCount?: number; strategy?: string }`

Keep additions optional for backward compatibility.

## Drift detection strategy

Keep CI drift mostly deterministic.

Recommended layers:

### 1. Static current DOM diff

Existing behavior:

```text
current route -> discovery -> manifest diff
```

Good for simple/static pages.

### 2. Recorded exploration replay

This is the most important next phase.

Replay saved graph actions deterministically:

```text
initial route
  -> replay action A
  -> scan state
  -> compare state groups
  -> replay action B
  -> scan state
  -> compare state groups
```

It should catch:

- dialogs no longer opening
- buttons renamed
- menus removed
- tabs changed
- route transitions broken
- API calls no longer firing

Potential command:

```text
pw-crawl drift <url> --graph .autopom/exploration.json --manifests .autopom/manifests --pages tests/pages
```

Or reuse:

```text
pw-crawl explore <url> --replay --check --graph-output .autopom/exploration.json --manifest-output .autopom/manifests
```

### 3. Assisted drift refresh

If deterministic replay fails, use AI/MCP to suggest remediation.

Example:

```text
Action failed:
  previous: click button "Add Product"
  current visible alternatives:
    "New Product"
    "Create Product"

Suggested update:
  replace action target "Add Product" with "New Product"
```

This should produce a suggestion or patch, not silently mutate CI baselines.

### 4. Exploratory drift detection

Agent explores current app from scratch and compares generated manifest against baseline.

Useful locally, not ideal for CI.

## Page object strategy

Keep stable POM generation deterministic:

```text
exploration graph -> manifests -> emitter -> page objects
```

Do not let MCP directly emit final page objects in the stable path.

Future optional layer:

- `*.generated.ts`: deterministic POM from manifest.
- `*.actions.ts`: optional AI-suggested workflow helpers.
- `*.spec.ts`: optional AI-suggested tests.

Keep AI-suggested higher-level methods separate from core generated files.

## Safety model

Default denylist actions containing:

- delete
- remove
- archive
- destroy
- cancel subscription
- purchase
- pay
- checkout
- submit order
- confirm
- reset
- logout
- sign out

Default safe actions:

- open
- view
- details
- search
- filter
- sort
- expand
- collapse
- next
- previous
- tab switching
- menu opening

Strategies:

- `conservative`: no form submission, no destructive labels, no payment/checkout, no logout, no unknown high-risk actions.
- `balanced`: submit generated test-data forms, follow internal navigation, trigger local/dev saves.
- `aggressive`: explore most actions except explicit denylist.

## Auth support

Future real apps need auth support:

- accept Playwright `storageState`
- allow setup script later
- redact sensitive values from graph
- never store passwords in manifests or graphs

Example:

```text
pw-crawl explore https://app.local --auth-state .auth/user.json
```

## Network attribution

Use existing `NetworkObserver` and `triggeredBy` support.

For each action, capture:

- request method
- URL pattern
- timing
- triggering action
- route/state
- response status class
- optional schema fingerprint

Keep manifest API dependencies concise. Store richer debug data in the exploration graph.

## State deduplication

Avoid loops using a state key:

```text
routeTemplate + domHash + ariaHash + visibleActionSignature
```

Clean/harden hashes by ignoring volatile attributes:

- generated IDs
- timestamps
- random tokens
- React/Vue/Angular implementation IDs

## Action identity

Store robust replay locators, not only CSS selectors.

Priority:

1. role + accessible name
2. label
3. text
4. test id
5. generated CSS fallback
6. nth/index only as last resort

Example:

```json
{
  "kind": "click",
  "role": "button",
  "name": "Add Product",
  "fallbackSelector": "button.primary",
  "routeTemplate": "/products"
}
```

This aligns with the label-first framework architecture.

## Testing plan

Unit tests:

- action extraction
- action risk classification
- state hashing
- graph merge
- graph replay planning
- action identity resolution
- drift report formatting

Integration tests using fixture apps:

- Vanilla: static discovery
- React/MUI: portaled dialogs
- Vue/Vuetify: teleported overlays
- Angular Material: CDK overlays
- Svelte: conditionally rendered UI
- Lit/Shoelace: Shadow DOM

Golden tests:

1. Run explore.
2. Compare manifest snapshot.
3. Generate POM.
4. Compare generated source.
5. Replay graph.
6. Assert no drift.

MCP tests:

- no real MCP in normal CI
- use mocked MCP responses for unit tests
- optional nightly real MCP integration job

## Recommended next implementation phase

The best next task is **deterministic graph replay drift detection**.

Concrete work items:

1. Add graph reader/validator.
2. Add action replay resolver using stored `ActionLocatorHint`.
3. Add replay mode that walks saved graph action paths.
4. Rescan each reached state with existing discovery.
5. Compare reached state groups/API dependencies against baseline manifests.
6. Produce a deterministic drift report.
7. Add unit tests for replay planning and action resolution.
8. Add integration smoke tests against at least vanilla and one portaled-overlay app.

Suggested CLI shape:

```text
pw-crawl drift <url> --graph .autopom/exploration.json --manifests .autopom/manifests
```

or, if avoiding a new subcommand initially:

```text
pw-crawl explore <url> --replay --check --graph-output .autopom/exploration.json --manifest-output .autopom/manifests
```

## Later implementation phases

1. Stabilize `explore` with real fixture-app coverage.
2. Add deterministic graph replay drift detection.
3. Add AI-guided action planning.
4. Add MCP controller adapter.
5. Add assisted repair/update flow.
6. Add auth/setup support.
7. Add optional higher-level helper generation.

## Product positioning

autoPOM should not be "an AI agent that writes page objects."

Better positioning:

> A deterministic page-object generation system with optional agentic exploration.

This gives the benefits of MCP/AI exploration without sacrificing stable manifests, reviewable codegen, and CI-friendly drift detection.
