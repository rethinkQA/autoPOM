#!/usr/bin/env node

/**
 * pw-crawl CLI — crawl a live page, emit JSON manifests, and generate page objects.
 *
 * Usage (crawl):
 *   npx pw-crawl <url>                           # Crawl page, emit to stdout
 *   npx pw-crawl <url> -o manifest.json           # Write/merge to file
 *   npx pw-crawl <url> -o manifest.json --pass 2  # Append-only merge pass
 *   npx pw-crawl <url> --scope ".main-content"    # Limit crawl to a section
 *   npx pw-crawl <url> --diff manifest.json       # Compare DOM vs manifest
 *   npx pw-crawl <url> --observe-network          # Include API dependency discovery
 *
 * Usage (generate):
 *   npx pw-crawl generate manifest.json -o pages/          # Emit page objects from manifest
 *   npx pw-crawl generate manifest.json --check pages/     # CI mode, exit 1 if drift
 *   npx pw-crawl generate m1.json m2.json -o pages/        # Multi-route with template detection
 *   npx pw-crawl generate manifest.json --config .pw-crawl.json  # Custom config
 */

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { crawlPage, diffPage } from "../src/crawler.js";
import { explorePage, exploreWithController } from "../src/explore.js";
import { exploreWithAgent } from "../src/agent-explore.js";
import { createAnthropicAgent } from "../src/ai/agent-anthropic.js";
import { emitPageObject, emitMultiRoute } from "../src/emitter.js";
import { diffPageObjects, formatEmitterDiff } from "../src/emitter-diff.js";
import { inferRouteName, labelToPropertyName, safePathname, normalizeRoute } from "../src/naming.js";
import { DomRecorder } from "../src/recorder.js";
import { injectNavigationInterceptor } from "../src/navigation.js";
import { NetworkObserver } from "../src/network.js";
import type { PageRecording } from "../src/recorder.js";
import { mergeManifest } from "../src/merge.js";
import type { ApiDependency, CrawlerManifest, ManifestGroup } from "../src/types.js";
import type { EmitterConfig, RouteManifest } from "../src/emitter-types.js";
import type { AiProviderName, AiProvider, AiPageSummary } from "../src/ai/types.js";
import type { ExploreStrategy } from "../src/explore-types.js";
import {
  formatDriftReport,
  loadBaselineManifests,
  loadExplorationGraph,
  replayGraph,
  GraphValidationError,
  type DriftReport,
} from "../src/replay.js";
import { PlaywrightBrowserController, type IBrowserController } from "../src/browser-controller.js";
import { createMcpController } from "../src/mcp-factory.js";
import { suggestRepairs } from "../src/repair.js";
import { createAnthropicRepairAgent } from "../src/ai/agent-anthropic.js";

// ── Safe JSON parsing (P2-163/P2-211) ──────────────────────

/** Parse JSON with a user-friendly error message including file path. */
function safeJsonParse<T = unknown>(raw: string, filePath: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error: Invalid JSON in ${filePath}: ${(err as Error).message}`);
    process.exit(1);
  }
}

/** P2-285: Lightweight manifest schema validation. */
function validateManifest(data: unknown, filePath: string): CrawlerManifest {
  if (!data || typeof data !== "object") {
    console.error(`Error: ${filePath} is not a valid manifest object`);
    process.exit(1);
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.groups)) {
    console.error(`Error: ${filePath} is missing required "groups" array`);
    process.exit(1);
  }
  if (typeof obj.url !== "string") {
    console.error(`Error: ${filePath} is missing required "url" string`);
    process.exit(1);
  }
  return data as CrawlerManifest;
}

// ── Argument parsing ────────────────────────────────────────

interface CrawlArgs {
  mode: "crawl";
  url: string;
  output?: string;
  pass: number;
  scope?: string;
  diff?: string;
  observeNetwork: boolean;
  headless: boolean;
  ignoreHTTPSErrors: boolean;
  help: boolean;
  aiProvider?: AiProviderName;
  aiModel?: string;
  aiKey?: string;
  aiBaseUrl?: string;
}

interface GenerateArgs {
  mode: "generate";
  manifests: string[];
  output?: string;
  check?: string;
  configFile?: string;
  frameworkImport?: string;
  help: boolean;
}

interface RecordArgs {
  mode: "record";
  url: string;
  output?: string;
  scope?: string;
  ignoreHTTPSErrors: boolean;
  help: boolean;
  aiProvider?: AiProviderName;
  aiModel?: string;
  aiKey?: string;
  aiBaseUrl?: string;
}

interface ExploreArgs {
  mode: "explore";
  url: string;
  output?: string;
  manifestOutput?: string;
  pagesOutput?: string;
  graphOutput?: string;
  maxDepth?: number;
  maxActions?: number;
  maxRoutes?: number;
  maxRescans?: number;
  strategy: ExploreStrategy;
  scope?: string;
  observeNetwork: boolean;
  headless: boolean;
  ignoreHTTPSErrors: boolean;
  check: boolean;
  help: boolean;
  mcp: boolean;
  mcpCdpPort?: number;
  authState?: string;
  aiAgent: boolean;
  aiProvider?: AiProviderName;
  aiModel?: string;
  aiKey?: string;
  aiBaseUrl?: string;
}

interface DriftArgs {
  mode: "drift";
  url: string;
  graph?: string;
  manifests?: string;
  output?: string;
  scope?: string;
  observeNetwork: boolean;
  headless: boolean;
  ignoreHTTPSErrors: boolean;
  maxPaths?: number;
  json: boolean;
  help: boolean;
  mcp: boolean;
  mcpCdpPort?: number;
  authState?: string;
  repair: boolean;
  repairOutput?: string;
  aiProvider?: AiProviderName;
  aiModel?: string;
  aiKey?: string;
  aiBaseUrl?: string;
}

type CliArgs = CrawlArgs | GenerateArgs | RecordArgs | ExploreArgs | DriftArgs;

/** Validate that argv[index] exists and is not another flag. */
function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("-")) {
    console.error(`Error: ${flag} requires a value`);
    process.exit(1);
  }
  return value;
}

function parseCrawlArgs(argv: string[]): CrawlArgs {
  const args: CrawlArgs = {
    mode: "crawl",
    url: "",
    pass: 1,
    observeNetwork: true,
    headless: true,
    ignoreHTTPSErrors: false,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv, ++i, arg);
        break;
      case "--pass":
        args.pass = parseInt(requireValue(argv, ++i, arg), 10);
        if (isNaN(args.pass) || args.pass < 1) {
          console.error("Error: --pass must be a positive integer");
          process.exit(1);
        }
        break;
      case "--scope":
        args.scope = requireValue(argv, ++i, arg);
        break;
      case "--diff":
        args.diff = requireValue(argv, ++i, arg);
        break;
      case "--observe-network":
        args.observeNetwork = true;
        break;
      case "--no-observe-network":
        args.observeNetwork = false;
        break;
      case "--headed":
        args.headless = false;
        break;
      case "--ignore-https-errors":
        args.ignoreHTTPSErrors = true;
        break;
      case "--ai-provider":
        args.aiProvider = requireValue(argv, ++i, arg) as AiProviderName;
        break;
      case "--ai-model":
        args.aiModel = requireValue(argv, ++i, arg);
        break;
      case "--ai-key":
        args.aiKey = requireValue(argv, ++i, arg);
        break;
      case "--ai-base-url":
        args.aiBaseUrl = requireValue(argv, ++i, arg);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-") && !args.url) {
          args.url = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
    i++;
  }

  return args;
}

function parseGenerateArgs(argv: string[]): GenerateArgs {
  const args: GenerateArgs = {
    mode: "generate",
    manifests: [],
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv, ++i, arg);
        break;
      case "--check":
        args.check = requireValue(argv, ++i, arg);
        break;
      case "--config":
        args.configFile = requireValue(argv, ++i, arg);
        break;
      case "--framework-import":
        args.frameworkImport = requireValue(argv, ++i, arg);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          args.manifests.push(arg);
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
    i++;
  }

  return args;
}

function parseArgs(argv: string[]): CliArgs {
  // Check if first positional arg is a subcommand
  if (argv[0] === "generate") {
    return parseGenerateArgs(argv.slice(1));
  }
  if (argv[0] === "record") {
    return parseRecordArgs(argv.slice(1));
  }
  if (argv[0] === "explore") {
    return parseExploreArgs(argv.slice(1));
  }
  if (argv[0] === "drift") {
    return parseDriftArgs(argv.slice(1));
  }
  return parseCrawlArgs(argv);
}

function parseDriftArgs(argv: string[]): DriftArgs {
  const args: DriftArgs = {
    mode: "drift",
    url: "",
    observeNetwork: true,
    headless: true,
    ignoreHTTPSErrors: false,
    json: false,
    help: false,
    mcp: false,
    repair: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "--graph":
        args.graph = requireValue(argv, ++i, arg);
        break;
      case "--manifests":
        args.manifests = requireValue(argv, ++i, arg);
        break;
      case "-o":
      case "--output":
        args.output = requireValue(argv, ++i, arg);
        break;
      case "--scope":
        args.scope = requireValue(argv, ++i, arg);
        break;
      case "--observe-network":
        args.observeNetwork = true;
        break;
      case "--no-observe-network":
        args.observeNetwork = false;
        break;
      case "--headed":
        args.headless = false;
        break;
      case "--ignore-https-errors":
        args.ignoreHTTPSErrors = true;
        break;
      case "--max-paths":
        args.maxPaths = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--json":
        args.json = true;
        break;
      case "--mcp":
        args.mcp = true;
        break;
      case "--no-mcp":
        args.mcp = false;
        break;
      case "--mcp-cdp-port":
        args.mcpCdpPort = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--auth-state":
        args.authState = requireValue(argv, ++i, arg);
        break;
      case "--repair":
        args.repair = true;
        break;
      case "--no-repair":
        args.repair = false;
        break;
      case "--repair-output":
        args.repairOutput = requireValue(argv, ++i, arg);
        break;
      case "--ai-provider":
        args.aiProvider = requireValue(argv, ++i, arg) as AiProviderName;
        break;
      case "--ai-model":
        args.aiModel = requireValue(argv, ++i, arg);
        break;
      case "--ai-key":
        args.aiKey = requireValue(argv, ++i, arg);
        break;
      case "--ai-base-url":
        args.aiBaseUrl = requireValue(argv, ++i, arg);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-") && !args.url) {
          args.url = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
    i++;
  }

  return args;
}

function parseRecordArgs(argv: string[]): RecordArgs {
  const args: RecordArgs = {
    mode: "record",
    url: "",
    ignoreHTTPSErrors: false,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv, ++i, arg);
        break;
      case "--scope":
        args.scope = requireValue(argv, ++i, arg);
        break;
      case "--ignore-https-errors":
        args.ignoreHTTPSErrors = true;
        break;
      case "--ai-provider":
        args.aiProvider = requireValue(argv, ++i, arg) as AiProviderName;
        break;
      case "--ai-model":
        args.aiModel = requireValue(argv, ++i, arg);
        break;
      case "--ai-key":
        args.aiKey = requireValue(argv, ++i, arg);
        break;
      case "--ai-base-url":
        args.aiBaseUrl = requireValue(argv, ++i, arg);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-") && !args.url) {
          args.url = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
    i++;
  }

  return args;
}

function parsePositiveIntFlag(argv: string[], index: number, flag: string): number {
  const value = parseInt(requireValue(argv, index, flag), 10);
  if (Number.isNaN(value) || value < 1) {
    console.error(`Error: ${flag} must be a positive integer`);
    process.exit(1);
  }
  return value;
}

function parseExploreArgs(argv: string[]): ExploreArgs {
  const args: ExploreArgs = {
    mode: "explore",
    url: "",
    strategy: "conservative",
    observeNetwork: true,
    headless: true,
    ignoreHTTPSErrors: false,
    check: false,
    help: false,
    mcp: false,
    aiAgent: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "-o":
      case "--output":
        args.output = requireValue(argv, ++i, arg);
        break;
      case "--manifest-output":
        args.manifestOutput = requireValue(argv, ++i, arg);
        break;
      case "--pages-output":
        args.pagesOutput = requireValue(argv, ++i, arg);
        break;
      case "--graph-output":
        args.graphOutput = requireValue(argv, ++i, arg);
        break;
      case "--max-depth":
        args.maxDepth = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--max-actions":
        args.maxActions = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--max-routes":
        args.maxRoutes = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--max-rescans":
        args.maxRescans = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--strategy": {
        const strategy = requireValue(argv, ++i, arg) as ExploreStrategy;
        if (!["conservative", "balanced", "aggressive"].includes(strategy)) {
          console.error("Error: --strategy must be conservative, balanced, or aggressive");
          process.exit(1);
        }
        args.strategy = strategy;
        break;
      }
      case "--scope":
        args.scope = requireValue(argv, ++i, arg);
        break;
      case "--observe-network":
        args.observeNetwork = true;
        break;
      case "--no-observe-network":
        args.observeNetwork = false;
        break;
      case "--headed":
        args.headless = false;
        break;
      case "--ignore-https-errors":
        args.ignoreHTTPSErrors = true;
        break;
      case "--check":
        args.check = true;
        break;
      case "--ai-provider":
        args.aiProvider = requireValue(argv, ++i, arg) as AiProviderName;
        break;
      case "--ai-model":
        args.aiModel = requireValue(argv, ++i, arg);
        break;
      case "--ai-key":
        args.aiKey = requireValue(argv, ++i, arg);
        break;
      case "--ai-base-url":
        args.aiBaseUrl = requireValue(argv, ++i, arg);
        break;
      case "--mcp":
        args.mcp = true;
        break;
      case "--no-mcp":
        args.mcp = false;
        break;
      case "--mcp-cdp-port":
        args.mcpCdpPort = parsePositiveIntFlag(argv, ++i, arg);
        break;
      case "--auth-state":
        args.authState = requireValue(argv, ++i, arg);
        break;
      case "--ai-agent":
        args.aiAgent = true;
        break;
      case "--no-ai-agent":
        args.aiAgent = false;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (!arg.startsWith("-") && !args.url) {
          args.url = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
    i++;
  }

  return args;
}

function printHelp(): void {
  console.log(`
pw-crawl — Runtime page crawler and page object generator for @playwright-elements

Usage:
  pw-crawl <url> [options]                         Crawl a page
  pw-crawl record <url> [options]                  Record mode (interactive)
  pw-crawl explore <url> [options]                 Autonomous exploration mode
  pw-crawl drift <url> [options]                   Replay-based drift detection
  pw-crawl generate <manifests...> [options]       Generate page objects

── Crawl Mode ──────────────────────────────────────────────────

Arguments:
  <url>                    URL of the page to crawl (required)

Options:
  -o, --output <file>      Write manifest to file (default: stdout)
  --pass <n>               Pass number for append-only merge (default: 1)
  --scope <selector>       Limit crawl to elements within this CSS selector
  --diff <file>            Compare current DOM against existing manifest
  --observe-network        Capture API dependencies during crawl (default: on)
  --no-observe-network     Disable API dependency capture
  --headed                 Run browser in headed mode (visible)
  --ignore-https-errors    Skip TLS certificate validation
  --ai-provider <name>     Use AI discovery (openai, anthropic, ollama)
  --ai-model <model>       AI model override (default: per-provider)
  --ai-key <key>           API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --ai-base-url <url>      Custom API base URL

── Explore Mode (Autonomous) ─────────────────────────────────

  Runs a conservative heuristic explorer that clicks safe visible actions,
  records an exploration graph, merges route manifests, and can generate
  page objects from the resulting manifests. The manifest/emitter pipeline
  remains the source of truth; MCP support is reserved for a future adapter.

Arguments:
  <url>                    URL of the page to explore (required)

Options:
  -o, --output <dir>       Write graph, manifests, and pages under this dir
  --manifest-output <dir>  Write route manifests to this directory
  --pages-output <dir>     Write generated page objects to this directory
  --graph-output <file>    Write exploration graph JSON to this file
  --max-depth <n>          Max action depth from start URL (default: 2)
  --max-actions <n>        Max attempted actions (default: 20)
  --max-routes <n>         Max distinct routes to enqueue (default: 10)
  --max-rescans <n>        Max rescans per route (default: 2)
  --strategy <name>        conservative | balanced | aggressive (default: conservative)
  --scope <selector>       Limit scanning and action extraction to a section
  --observe-network        Capture API dependencies during scans (default: on)
  --no-observe-network     Disable API dependency capture
  --headed                 Run browser in headed mode (visible)
  --check                  Compare generated files with existing outputs; exit 1 on drift
  --mcp                    Drive the browser via @playwright/mcp (action channel)
  --no-mcp                 Disable MCP, use direct Playwright (default)
  --mcp-cdp-port <port>    Force a CDP port (default: ephemeral) when --mcp is on
  --auth-state <file>      Playwright storageState JSON for cookies/localStorage
  --ai-agent               Use a tool-using AI agent to pick actions (Slice 2)
  --no-ai-agent            Disable AI agent, use heuristic planner (default)
  --ai-provider <name>     Use AI discovery for state scans (openai, anthropic, ollama)
  --ai-model <model>       AI model override (default: per-provider)
  --ai-key <key>           API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --ai-base-url <url>      Custom API base URL

  --mcp requires the optional peer deps:
    npm install --save-optional @playwright/mcp @modelcontextprotocol/sdk

  --ai-agent currently requires --ai-provider anthropic and a valid
  ANTHROPIC_API_KEY. The agent picks each action via the Anthropic Messages
  API tool-use; the manifest pipeline is unchanged. Non-deterministic — use
  for nightly/manual runs, not the CI replay path.

  --auth-state expects a Playwright storageState JSON file (see
  https://playwright.dev/docs/auth#reuse-signed-in-state). With --mcp, the
  file is forwarded to @playwright/mcp via --storage-state so cookies and
  localStorage load before any navigation. Do not commit auth-state files.

── Drift Mode (Deterministic Replay) ────────────────────────

  Replays a saved exploration graph against the current app, rescans each
  reached state, and compares the result to baseline manifests. Useful in CI
  to catch renamed buttons, removed dialogs, broken navigation, and missing
  API calls without re-running full agentic exploration.

Arguments:
  <url>                    URL of the page to drift-check (required)

Options:
  --graph <file>           Path to the exploration graph JSON (required)
  --manifests <dir>        Directory of baseline route manifests (optional)
  -o, --output <file>      Write the drift report JSON to this file
  --scope <selector>       Limit rescans to a CSS selector
  --observe-network        Capture API dependencies during rescans (default: on)
  --no-observe-network     Disable API dependency capture
  --headed                 Run browser in headed mode (visible)
  --ignore-https-errors    Skip TLS certificate validation
  --max-paths <n>          Limit how many planned paths get replayed
  --json                   Emit the drift report as JSON to stdout
  --mcp                    Drive the browser via @playwright/mcp (action channel)
  --no-mcp                 Disable MCP, use direct Playwright (default)
  --mcp-cdp-port <port>    Force a CDP port (default: ephemeral) when --mcp is on
  --auth-state <file>      Playwright storageState JSON for cookies/localStorage
  --repair                 On failed actions, ask the AI agent for replacement
                           locators and write a repair-suggestions.json file.
                           Requires --ai-provider anthropic.
  --no-repair              Disable repair pass (default)
  --repair-output <file>   Where to write the suggestions JSON (default:
                           <output-dir>/repair-suggestions.json or cwd)
  --ai-provider <name>     Use AI discovery during rescans (openai, anthropic, ollama)
  --ai-model <model>       AI model override (default: per-provider)
  --ai-key <key>           API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --ai-base-url <url>      Custom API base URL

── Record Mode (Interactive) ───────────────────────────────────

  Opens a headed browser with a DOM flight recorder injected.
  Interact with the page to trigger dialogs, toasts, and dynamic
  elements. Press Ctrl+C to harvest all discovered groups.

Arguments:
  <url>                    URL of the page to record (required)

Options:
  -o, --output <dir>       Output directory for per-page manifests (default: stdout)
  --scope <selector>       Limit recording to a section of the page
  --ignore-https-errors    Skip TLS certificate validation
  --ai-provider <name>     Use AI discovery (openai, anthropic, ollama)
  --ai-model <model>       AI model override (default: per-provider)
  --ai-key <key>           API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --ai-base-url <url>      Custom API base URL

── Generate Mode ───────────────────────────────────────────────

Arguments:
  <manifests...>           One or more manifest JSON files

Options:
  -o, --output <dir>       Output directory for page object files (default: stdout)
  --check <dir>            CI mode: compare against existing files, exit 1 if different
  --config <file>          Config file (.pw-crawl.json) for property name/selector overrides
  --framework-import <mod> Framework import path (default: @playwright-elements/core)

── Common Options ──────────────────────────────────────────────

  -h, --help               Show this help message

── Examples ────────────────────────────────────────────────────

  # Crawl
  pw-crawl http://localhost:3001 -o manifest.json
  pw-crawl http://localhost:3001 --diff manifest.json

  # Record (interactive — discover dialogs, toasts, etc.)
  pw-crawl record http://localhost:3001 -o manifest.json

  # Explore (autonomous — graph + manifests + page objects)
  pw-crawl explore http://localhost:3001 -o .autopom --max-depth 2 --max-actions 20

  # Generate (single manifest)
  pw-crawl generate manifest.json -o pages/
  pw-crawl generate manifest.json --check pages/

  # Generate (multi-route with template detection)
  pw-crawl generate home.json about.json -o pages/

Exit codes:
  0  Success (or no drift when using --diff/--check)
  1  Drift detected, or error
`);
}

// ── Generate mode ───────────────────────────────────────────

async function runGenerate(args: GenerateArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.manifests.length === 0) {
    console.error("Error: At least one manifest file is required. Use --help for usage information.");
    process.exit(1);
  }

  // Load config file if specified
  let config: EmitterConfig = {};
  if (args.configFile) {
    const configPath = resolve(args.configFile);
    if (!existsSync(configPath)) {
      console.error(`Error: Config file not found: ${configPath}`);
      process.exit(1);
    }
    const raw = await readFile(configPath, "utf-8");
    config = safeJsonParse<EmitterConfig>(raw, configPath);
  }

  const frameworkImport = args.frameworkImport ?? config.frameworkImport ?? "@playwright-elements/core";

  // Load manifests
  const routes: RouteManifest[] = [];
  for (const manifestPath of args.manifests) {
    const fullPath = resolve(manifestPath);
    if (!existsSync(fullPath)) {
      console.error(`Error: Manifest file not found: ${fullPath}`);
      process.exit(1);
    }
    const raw = await readFile(fullPath, "utf-8");
    const manifest = validateManifest(safeJsonParse(raw, fullPath), fullPath);

    // Infer route name from filename or manifest URL
    const withoutJson = basename(manifestPath, ".json");
    const rawFromFilename = withoutJson.replace(/[.-]manifest$/, "");
    const route = rawFromFilename !== withoutJson
      ? labelToPropertyName(rawFromFilename)
      : inferRouteName(manifest.url);

    routes.push({ route, manifest });
  }

  // Generate page objects
  const emitOptions = {
    frameworkImport,
    propertyNameOverrides: config.propertyNames,
    generatedMarkers: true,
    emitWaitForReady: true,
  };

  let files: Map<string, string>;
  if (routes.length === 1) {
    const route = routes[0];
    const filename = `${route.route}.ts`;
    files = new Map([[filename, emitPageObject(route.manifest, {
      ...emitOptions,
      routeName: route.route,
    })]]);
  } else {
    files = emitMultiRoute(routes, emitOptions);
  }

  // ── Check mode (CI) ────────────────────────────────────
  if (args.check) {
    const checkDir = resolve(args.check);
    let hasDrift = false;

    for (const [filename, generated] of files) {
      const existingPath = join(checkDir, filename);
      if (!existsSync(existingPath)) {
        console.log(`⚠ New file: ${filename}`);
        hasDrift = true;
        continue;
      }

      const existing = await readFile(existingPath, "utf-8");
      const diff = diffPageObjects(generated, existing);

      if (!diff.unchanged) {
        console.log(`\n─── ${filename} ───`);
        console.log(formatEmitterDiff(diff));
        hasDrift = true;
      }
    }

    // TODO: detect stale files in checkDir that are no longer generated
    // (requires scanning checkDir for .ts files with @generated marker)

    if (hasDrift) {
      console.log("\n✗ Page object drift detected. Run without --check to regenerate.");
      process.exit(1);
    } else {
      console.log("✓ All generated page objects match existing files.");
      process.exit(0);
    }
  }

  // ── Output mode ────────────────────────────────────────
  if (args.output) {
    const outputDir = resolve(args.output);
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    for (const [filename, source] of files) {
      const outputPath = join(outputDir, filename);
      await writeFile(outputPath, source, "utf-8");
      console.error(`  ✓ ${outputPath}`);
    }

    console.error(`\n✓ Generated ${files.size} page object file(s) in ${outputDir}`);
  } else {
    // Print to stdout (single file: just source; multiple: delimited)
    if (files.size === 1) {
      const [, source] = [...files.entries()][0];
      console.log(source);
    } else {
      for (const [filename, source] of files) {
        console.log(`\n// ═══ ${filename} ═══\n`);
        console.log(source);
      }
    }
  }
}

// ── Record mode ─────────────────────────────────────────────

async function runRecord(args: RecordArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error("Error: URL is required. Use --help for usage information.");
    process.exit(1);
  }

  // Record mode always runs headed so the user can interact.
  // Disable Playwright's built-in SIGINT/SIGTERM/SIGHUP handling so that
  // Ctrl+C doesn't kill the browser before we can harvest recorded data.
  const launchArgs = args.ignoreHTTPSErrors ? ["--ignore-certificate-errors"] : [];
  const browser = await chromium.launch({
    headless: false,
    args: launchArgs,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: args.ignoreHTTPSErrors });
    const page = await context.newPage();

    // ── Network observation (AI mode only) ───────────────────
    // In heuristic mode, DomRecorder manages its own NetworkObserver.
    // In AI mode, we need a standalone observer since there's no DomRecorder.
    // IMPORTANT: Start BEFORE page.goto() so initial page-load API calls are captured.
    let networkObserver: NetworkObserver | null = null;
    let networkInteractionTimestamp = 0;
    let actionClearTimer: ReturnType<typeof setTimeout> | null = null;
    const apiDepsByRoute = new Map<string, ApiDependency[]>();
    const actionNavsByRoute = new Map<string, Array<{ triggeredBy: string; navigatesTo: string }>>();
    let currentRoute = safePathname(args.url); // use args.url; page hasn't navigated yet

    if (args.aiProvider) {
      networkObserver = new NetworkObserver(page);
      networkObserver.start();
      console.error("  📡 Network observer started (before navigation)");
    }

    await page.goto(args.url, { waitUntil: "domcontentloaded" });
    currentRoute = safePathname(page.url()); // update after redirects

    // Resolve AI provider if requested
    let aiProvider: AiProvider | undefined;
    if (args.aiProvider) {
      const { createAiProvider } = await import("../src/ai/provider.js");
      aiProvider = await createAiProvider({
        provider: args.aiProvider,
        model: args.aiModel,
        apiKey: args.aiKey,
        baseUrl: args.aiBaseUrl,
      });
    }

    if (aiProvider) {

      // Bridge browser clicks to NetworkObserver for attribution.
      try {
        await page.exposeFunction("__pwNetworkAction", (description: string) => {
          if (!networkObserver) return;
          if (actionClearTimer) clearTimeout(actionClearTimer);
          networkObserver.setAction(description);
          if (!networkInteractionTimestamp) networkInteractionTimestamp = Date.now();
          actionClearTimer = setTimeout(() => {
            networkObserver?.clearAction();
            actionClearTimer = null;
          }, 2000);
        });
      } catch {
        // May already be exposed
      }

      // Inject a click listener that bridges to Node
      await page.evaluate(() => {
        document.addEventListener("click", (e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          const text = target.textContent?.trim().slice(0, 60) || "";
          const tag = target.tagName.toLowerCase();
          const ariaLabel = target.getAttribute("aria-label") || "";
          const desc = ariaLabel
            ? `click on "${ariaLabel}"`
            : text
              ? `click on "${text}" (${tag})`
              : `click on ${tag}`;
          if (typeof (window as any).__pwNetworkAction === "function") {
            (window as any).__pwNetworkAction(desc);
          }
        }, { capture: true });
      });
    }

    /** Stop observer for current route, store deps, start fresh (AI mode only). */
    function rotateNetworkObserver(): void {
      if (!networkObserver) return;
      if (actionClearTimer) { clearTimeout(actionClearTimer); actionClearTimer = null; }
      // Capture last action label BEFORE clearing — needed for action navigation tracking
      const lastAction = networkObserver.getLastActionLabel();
      networkObserver.clearAction();
      const deps = networkObserver.stop(networkInteractionTimestamp || undefined);
      const prevRoute = currentRoute;
      if (deps.length > 0) {
        const existing = apiDepsByRoute.get(currentRoute) ?? [];
        const seen = new Map<string, ApiDependency>();
        for (const d of [...existing, ...deps]) {
          const key = `${d.method}:${d.pattern}`;
          if (!seen.has(key)) seen.set(key, d);
        }
        apiDepsByRoute.set(currentRoute, Array.from(seen.values()));
      }
      currentRoute = safePathname(page.url());
      // Track action→navigation for the page we're leaving
      if (lastAction && currentRoute !== prevRoute) {
        const navs = actionNavsByRoute.get(prevRoute) ?? [];
        const key = `${lastAction}::${currentRoute}`;
        if (!navs.some(n => `${n.triggeredBy}::${n.navigatesTo}` === key)) {
          navs.push({ triggeredBy: lastAction, navigatesTo: currentRoute });
          actionNavsByRoute.set(prevRoute, navs);
        }
      }
      networkObserver = new NetworkObserver(page);
      networkObserver.start();
      networkInteractionTimestamp = 0;
      console.error(`  📡 Network: rotated for "${prevRoute}" → ${deps.length} dep(s), now watching "${currentRoute}"`);
    }

    // Re-inject click listener and rotate observer on navigation (AI mode)
    if (aiProvider) {
      page.on("domcontentloaded", () => {
        rotateNetworkObserver();
        page.evaluate(() => {
          document.addEventListener("click", (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const text = target.textContent?.trim().slice(0, 60) || "";
            const tag = target.tagName.toLowerCase();
            const ariaLabel = target.getAttribute("aria-label") || "";
            const desc = ariaLabel
              ? `click on "${ariaLabel}"`
              : text
                ? `click on "${text}" (${tag})`
                : `click on ${tag}`;
            if (typeof (window as any).__pwNetworkAction === "function") {
              (window as any).__pwNetworkAction(desc);
            }
          }, { capture: true });
        }).catch(() => {});
      });
    }

    // ── AI record mode: analyze each page on arrival ──────────
    // We can't revisit pages at the end because state changes (e.g.
    // login) mean earlier pages (login form) won't be there anymore.
    // Instead, run AI discovery immediately when each new page loads.
    //
    // Page identity is determined solely by the URL route template.
    // Dynamic segments are collapsed: /devices/123 → /devices/:id.
    // AI-chosen pageName is used only for file naming (cosmetic).

    /** Collected results: array of { page (template), pageName (AI-chosen), pathname, groups, scanIndex } */
    const aiScans: { page: string; pageName: string; pathname: string; groups: ManifestGroup[]; scanIndex: number }[] = [];
    /** Track how many scans each route template has had. */
    const scanCounts = new Map<string, number>();
    let aiAnalyzing = false; // prevent overlapping analysis

    async function analyzeCurrentPage(force = false): Promise<void> {
      if (!aiProvider || aiAnalyzing) return;

      const { page: routeTemplate, pathname } = normalizeRoute(page.url());

      // Exact route match: already scanned this template before
      const exactCount = scanCounts.get(routeTemplate) ?? 0;

      // Auto-scans skip if this route template was already analyzed;
      // manual (force) always runs (for hover menus, edit mode, etc.)
      if (!force && exactCount > 0) return;

      aiAnalyzing = true;

      console.error(`  🤖 Analyzing ${routeTemplate}…`);
      try {
        const { discoverGroupsWithAi } = await import("../src/ai/discover-ai.js");

        // Build cross-page context from previous scans
        const previousPages: AiPageSummary[] = [];
        const seenPages = new Set<string>();
        for (const scan of aiScans) {
          if (!seenPages.has(scan.page) && scan.groups.length > 0) {
            seenPages.add(scan.page);
            previousPages.push({
              pageName: scan.pageName,
              url: scan.pathname,
              groups: scan.groups.map((g) => ({
                label: g.label,
                groupType: g.groupType,
                wrapperType: g.wrapperType,
              })),
            });
          }
        }

        // AI discovery: ARIA tree → AI → getByRole → selectors
        // On auto-scans, filter invisible elements (phantom DOM artifacts).
        // On manual re-scans (force=true / F8), include them since the user
        // intentionally revealed dynamic elements.
        const result = await discoverGroupsWithAi(page, aiProvider!, {
          scope: args.scope ?? undefined,
          pass: `ai-record-${(exactCount || 0) + 1}`,
          previousPages: previousPages.length > 0 ? previousPages : undefined,
          filterInvisible: !force,
        });
        const { pageName, groups } = result;

        // Page identity is determined solely by the URL route template.
        // AI pageName is cosmetic only (used for file naming).
        const count = scanCounts.get(routeTemplate) ?? 0;
        const scanIndex = count + 1;

        aiScans.push({ page: routeTemplate, pageName, pathname, groups, scanIndex });
        scanCounts.set(routeTemplate, scanIndex);

        const label = scanIndex > 1 ? `${routeTemplate} (scan ${scanIndex})` : routeTemplate;
        console.error(`  ✓ ${label} — ${groups.length} group(s) found`);
      } catch (err: unknown) {
        console.error(`  ⚠ AI analysis failed for ${routeTemplate}: ${err instanceof Error ? err.message : err}`);
        aiScans.push({ page: routeTemplate, pageName: "page", pathname, groups: [], scanIndex: 1 });
        scanCounts.set(routeTemplate, 1);
      } finally {
        aiAnalyzing = false;
      }
    }

    // ── SPA navigation interception ─────────────────────────
    // SPAs never fire domcontentloaded for pushState/replaceState routes.
    // We patch the History API to detect ALL route changes.
    if (aiProvider) {
      // Debounce timer for SPA route changes (let DOM settle)
      let navDebounce: ReturnType<typeof setTimeout> | undefined;

      await page.exposeFunction("__pwRouteChanged", (url: string) => {
        clearTimeout(navDebounce);
        // Rotate network observer immediately on SPA navigation so deps
        // are attributed to the route they were captured on.
        rotateNetworkObserver();
        navDebounce = setTimeout(() => void analyzeCurrentPage(), 1500);
      });
    }

    // Analyze the initial page immediately (e.g. the login screen)
    if (aiProvider) {
      await analyzeCurrentPage();
      // Inject History API interceptor after initial page is ready
      await injectNavigationInterceptor(page);
    }

    // On full-page navigation (domcontentloaded), re-inject interceptor + analyze
    if (aiProvider) {
      page.on("domcontentloaded", () => {
        // Re-inject for the new document
        void injectNavigationInterceptor(page);
        // Small delay to let the page render after DOM ready
        setTimeout(() => void analyzeCurrentPage(), 1500);
      });
    }

    // Only set up DomRecorder in heuristic mode
    let recorder: DomRecorder | undefined;
    if (!aiProvider) {
      recorder = new DomRecorder(page);
      await recorder.start();
    }

    const modeLabel = aiProvider ? "AI" : "heuristic";
    console.error(`\n  ● Recording (${modeLabel}) — interact with the page to trigger dynamic elements.`);
    console.error("  ● Navigate freely (login, follow links) — each page gets its own manifest.");
    if (aiProvider) {
      console.error("  ● Each page is analyzed automatically when you navigate to it.");
      console.error("  ● Press F8 in the browser to re-scan (adds hover menus, dropdowns, etc. to the same page).");
      console.error("  ● Or press Enter in the terminal to re-scan.");
    }
    console.error("  ● Press Ctrl+C when done to save.\n");

    // Listen for F8 keypress in the browser to trigger re-scan.
    // This lets the user capture hover states without losing browser focus.
    if (aiProvider) {
      // Expose a Node function to the browser context
      await page.exposeFunction("__pwRescan", () => {
        void analyzeCurrentPage(true);
      });

      // Inject F8 listener into the page
      const injectF8Listener = async () => {
        await page.evaluate(() => {
          if ((window as any).__pwF8Bound) return;
          (window as any).__pwF8Bound = true;
          window.addEventListener("keydown", (e) => {
            if (e.key === "F8") {
              e.preventDefault();
              (window as any).__pwRescan();
            }
          });
        }).catch(() => {}); // may fail during navigation
      };

      await injectF8Listener();

      // Re-inject after each full-page navigation (exposeFunction survives
      // across navigations in the same context, but event listeners don't)
      page.on("load", () => {
        void injectF8Listener();
        void injectNavigationInterceptor(page);
      });
    }

    // Listen for Enter key in terminal to trigger manual re-scan
    if (aiProvider && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (data: Buffer) => {
        const key = data[0];
        // Enter = 0x0D (carriage return)
        if (key === 0x0d || key === 0x0a) {
          void analyzeCurrentPage(true);
        }
        // Ctrl+C = 0x03 — let the SIGINT handler deal with it
        if (key === 0x03) {
          process.emit("SIGINT", "SIGINT");
        }
      });
    }

    // Wait until the user sends SIGINT (Ctrl+C)
    await new Promise<void>((resolve) => {
      const handler = () => {
        process.off("SIGINT", handler);
        resolve();
      };
      process.on("SIGINT", handler);
    });

    // Keep a SIGINT handler registered during harvest so a second
    // Ctrl+C (from the process group) doesn't kill Node before we
    // finish saving manifests.
    const guardHandler = () => {
      console.error("  (saving in progress — please wait)");
    };
    process.on("SIGINT", guardHandler);

    // Clean up stdin raw mode
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    console.error("\n  ⏳ Saving recorded elements…");

    // Finalize the last page's network observer
    rotateNetworkObserver();

    // Debug: dump what the network observer captured
    if (apiDepsByRoute.size > 0) {
      console.error(`  📡 Network deps by route:`);
      for (const [route, deps] of apiDepsByRoute) {
        console.error(`    "${route}" → ${deps.length} dep(s): ${deps.map(d => `${d.method} ${d.pattern}`).join(", ")}`);
      }
    } else if (args.aiProvider) {
      console.error("  📡 Network: no API dependencies captured (observer may have started too late or app made no XHR/fetch calls)");
    }

    let pages: PageRecording[] = [];

    if (aiProvider) {
      // Analyze the current page if it hasn't been analyzed yet
      await analyzeCurrentPage();

      // Merge all scans for the same page into one manifest.
      // Page identity is solely route-template based — no AI pageName merging.
      const mergedByRoute = new Map<string, { pathname: string; routeTemplate?: string; groups: ManifestGroup[] }>();

      for (const scan of aiScans) {
        const existing = mergedByRoute.get(scan.page);
        if (existing) {
          // Merge groups — use mergeManifest's dedup to avoid duplicates
          const merged = mergeManifest(
            mergeManifest(null, existing.groups, existing.pathname, 1, args.scope ?? null),
            scan.groups,
            existing.pathname,
            2,
            args.scope ?? null,
          );
          existing.groups = merged.groups;
        } else {
          mergedByRoute.set(scan.page, { pathname: scan.pageName, routeTemplate: scan.page, groups: [...scan.groups] });
        }
      }

      for (const entry of mergedByRoute.values()) {
        pages.push(entry);
      }
    } else {
      // Heuristic mode: harvest from DomRecorder
      try {
        pages = await recorder!.harvestByPage();
        await recorder!.stop();
      } catch (harvestErr: unknown) {
        console.error(`  ⚠ Harvest error (using accumulated data): ${harvestErr instanceof Error ? harvestErr.message : harvestErr}`);
        pages = recorder!.getAccumulatedPages();
      }
    }

    const totalGroups = pages.reduce((n, p) => n + p.groups.length, 0);
    console.error(`  ✓ Recorded ${totalGroups} group(s) across ${pages.length} page(s)`);

    // Attach API dependencies from network observation to each page
    if (aiProvider) {
      // In AI mode, recording.routeTemplate is the normalized URL route (e.g. "/contactList").
      // apiDepsByRoute keys are actual URL pathnames from safePathname(page.url()).
      // Build a mapping: route template → URL pathnames from aiScans.
      const routeToPathnames = new Map<string, Set<string>>();
      for (const scan of aiScans) {
        const pathnames = routeToPathnames.get(scan.page) ?? new Set<string>();
        // scan.pathname = actual URL pathname (e.g. "/contactList")
        pathnames.add(scan.pathname);
        // scan.page = route template (e.g. "/contactList" or "/users/:id")
        // rotateNetworkObserver stores deps under safePathname(page.url()),
        // which is the actual pathname — but add the template too for safety
        if (scan.page !== scan.pathname) {
          pathnames.add(scan.page);
        }
        routeToPathnames.set(scan.page, pathnames);
      }

      // Debug: show the mapping
      if (apiDepsByRoute.size > 0) {
        console.error("  📡 Route template → URL pathname mapping:");
        for (const [route, paths] of routeToPathnames) {
          console.error(`    "${route}" → [${Array.from(paths).join(", ")}]`);
        }
      }

      for (const recording of pages) {
        const urlPathnames = routeToPathnames.get(recording.routeTemplate ?? recording.pathname) ?? new Set<string>();
        const collectedDeps: ApiDependency[] = [];
        const collectedNavs: Array<{ triggeredBy: string; navigatesTo: string }> = [];
        for (const urlPath of urlPathnames) {
          const deps = apiDepsByRoute.get(urlPath);
          if (deps) collectedDeps.push(...deps);
          const navs = actionNavsByRoute.get(urlPath);
          if (navs) collectedNavs.push(...navs);
        }
        if (collectedDeps.length > 0) {
          const existing = recording.apiDependencies ?? [];
          const seen = new Map<string, ApiDependency>();
          for (const d of [...existing, ...collectedDeps]) {
            const key = `${d.method}:${d.pattern}`;
            if (!seen.has(key)) seen.set(key, d);
          }
          recording.apiDependencies = Array.from(seen.values());
        }
        if (collectedNavs.length > 0) {
          const existing = recording.actionNavigations ?? [];
          const seen = new Map<string, (typeof collectedNavs)[0]>();
          for (const n of [...existing, ...collectedNavs]) {
            const key = `${n.triggeredBy}::${n.navigatesTo}`;
            if (!seen.has(key)) seen.set(key, n);
          }
          recording.actionNavigations = Array.from(seen.values());
        }
      }

      // Note: deps from routes not matching any recorded page (e.g. /logout)
      // are intentionally dropped — they don't belong to any page object.
    }
    // In heuristic mode, DomRecorder already attaches apiDependencies to each PageRecording.

    const totalDeps = pages.reduce((n, p) => n + (p.apiDependencies?.length ?? 0), 0);
    if (totalDeps > 0) {
      console.error(`  ✓ Captured ${totalDeps} API dependency(ies)`);
    }

    if (args.output) {
      // Write one manifest per page into the output directory.
      const outputDir = resolve(args.output);
      await mkdir(outputDir, { recursive: true });

      for (const recording of pages) {
        // Use the route template for file naming. For root routes ("/"),
        // infer from group labels (e.g. "Login Form" → "login") or AI pageName.
        let routeName: string;
        if (recording.routeTemplate === "/" || recording.routeTemplate === undefined && recording.pathname === "/") {
          // Check if groups suggest a login/auth page
          const loginGroup = recording.groups.find(g =>
            /\b(log\s*in|sign\s*in|auth)\b/i.test(g.label),
          );
          if (loginGroup) {
            routeName = "login";
          } else {
            routeName = aiProvider
              ? labelToPropertyName(recording.pathname)
              : "home";
          }
        } else {
          routeName = inferRouteName(recording.routeTemplate ?? recording.pathname);
        }
        const fileName = `${routeName}.manifest.json`;
        const filePath = join(outputDir, fileName);

        // Load existing manifest for this page if present (for merge)
        let existing: CrawlerManifest | null = null;
        if (existsSync(filePath)) {
          const raw = await readFile(filePath, "utf-8");
          existing = safeJsonParse<CrawlerManifest>(raw, filePath);
        }

        const manifest = mergeManifest(
          existing,
          recording.groups,
          recording.routeTemplate ?? recording.pathname,
          (existing?.passCount ?? 0) + 1,
          args.scope ?? null,
        );

        // Attach API dependencies from recording
        if (recording.apiDependencies && recording.apiDependencies.length > 0) {
          const existingDeps = manifest.apiDependencies ?? [];
          const seen = new Map<string, (typeof existingDeps)[0]>();
          for (const d of [...existingDeps, ...recording.apiDependencies]) {
            const key = `${d.method}:${d.pattern}`;
            if (!seen.has(key)) seen.set(key, d);
          }
          manifest.apiDependencies = Array.from(seen.values());
        }

        // Attach action navigations from recording
        if (recording.actionNavigations && recording.actionNavigations.length > 0) {
          const existingNavs = manifest.actionNavigations ?? [];
          const seen = new Map<string, (typeof existingNavs)[0]>();
          for (const n of [...existingNavs, ...recording.actionNavigations]) {
            const key = `${n.triggeredBy}::${n.navigatesTo}`;
            if (!seen.has(key)) seen.set(key, n);
          }
          manifest.actionNavigations = Array.from(seen.values());
        }

        await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
        console.error(`  ✓ ${fileName} — ${recording.groups.length} group(s)`);
      }

      console.error(`\n  Manifests written to ${outputDir}/`);
    } else {
      // No output flag — write all pages as a single JSON array to stdout
      const manifests = pages.map(recording => {
        const m = mergeManifest(null, recording.groups, recording.pathname, 1, args.scope ?? null);
        if (recording.apiDependencies && recording.apiDependencies.length > 0) {
          m.apiDependencies = recording.apiDependencies;
        }
        if (recording.actionNavigations && recording.actionNavigations.length > 0) {
          m.actionNavigations = recording.actionNavigations;
        }
        return m;
      });
      console.log(JSON.stringify(manifests, null, 2));
    }

    // Remove the SIGINT guard now that saving is complete
    process.off("SIGINT", guardHandler);
  } finally {
    await browser.close();
  }
}

// ── Browser controller selection ────────────────────────────

interface BrowserSession {
  controller: IBrowserController;
  dispose(): Promise<void>;
}

async function openExploreSession(args: {
  mcp: boolean;
  mcpCdpPort?: number;
  headless: boolean;
  ignoreHTTPSErrors: boolean;
  authState?: string;
}): Promise<BrowserSession> {
  const authStatePath = args.authState ? resolve(args.authState) : undefined;
  if (authStatePath && !existsSync(authStatePath)) {
    console.error(`Error: --auth-state file not found: ${authStatePath}`);
    process.exit(1);
  }

  if (args.mcp) {
    console.error("  ● Spawning @playwright/mcp (action channel)…");
    const mcpArgs: string[] = [];
    if (authStatePath) {
      mcpArgs.push("--storage-state", authStatePath);
    }
    const handle = await createMcpController({
      headless: args.headless,
      cdpPort: args.mcpCdpPort,
      chromiumArgs: args.ignoreHTTPSErrors ? ["--ignore-certificate-errors"] : [],
      mcpArgs,
    });
    return { controller: handle.controller, dispose: handle.dispose };
  }

  const launchArgs = args.ignoreHTTPSErrors ? ["--ignore-certificate-errors"] : [];
  const browser = await chromium.launch({
    headless: args.headless,
    args: launchArgs,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: args.ignoreHTTPSErrors,
    ...(authStatePath ? { storageState: authStatePath } : {}),
  });
  const page = await context.newPage();
  return {
    controller: new PlaywrightBrowserController(page),
    dispose: async () => {
      await browser.close();
    },
  };
}

// ── Explore mode ────────────────────────────────────────────

async function runExplore(args: ExploreArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error("Error: URL is required. Use --help for usage information.");
    process.exit(1);
  }

  const baseOutput = args.output ? resolve(args.output) : undefined;
  const manifestDir = args.manifestOutput ? resolve(args.manifestOutput) : baseOutput ? join(baseOutput, "manifests") : undefined;
  const pagesDir = args.pagesOutput ? resolve(args.pagesOutput) : baseOutput ? join(baseOutput, "pages") : undefined;
  const graphPath = args.graphOutput ? resolve(args.graphOutput) : baseOutput ? join(baseOutput, "exploration.json") : undefined;

  if (args.check && !manifestDir && !pagesDir && !graphPath) {
    console.error("Error: --check requires --output, --manifest-output, --pages-output, or --graph-output");
    process.exit(1);
  }

  const session = await openExploreSession({
    mcp: args.mcp,
    mcpCdpPort: args.mcpCdpPort,
    headless: args.headless,
    ignoreHTTPSErrors: args.ignoreHTTPSErrors,
    authState: args.authState,
  });

  try {
    let aiProvider: AiProvider | undefined;
    if (args.aiProvider) {
      const { createAiProvider } = await import("../src/ai/provider.js");
      aiProvider = await createAiProvider({
        provider: args.aiProvider,
        model: args.aiModel,
        apiKey: args.aiKey,
        baseUrl: args.aiBaseUrl,
      });
    }

    if (args.aiAgent && args.aiProvider !== "anthropic") {
      console.error(
        "Error: --ai-agent currently requires --ai-provider anthropic. Other providers are planned for a future slice.",
      );
      process.exit(1);
    }

    const transportLabel = args.mcp ? " via MCP" : "";
    const plannerLabel = args.aiAgent ? " (AI agent)" : "";
    console.error(`  ● Exploring ${args.url} (${args.strategy})${transportLabel}${plannerLabel}…`);

    let result;
    if (args.aiAgent) {
      let totalInput = 0;
      let totalCacheRead = 0;
      let totalCacheCreation = 0;
      let totalOutput = 0;
      const agent = createAnthropicAgent({
        apiKey: args.aiKey,
        model: args.aiModel,
        baseUrl: args.aiBaseUrl,
        onUsage: (usage) => {
          totalInput += usage.inputTokens;
          totalCacheRead += usage.cacheReadInputTokens;
          totalCacheCreation += usage.cacheCreationInputTokens;
          totalOutput += usage.outputTokens;
          console.error(
            `  agent usage: input=${usage.inputTokens} cache_read=${usage.cacheReadInputTokens} cache_create=${usage.cacheCreationInputTokens} output=${usage.outputTokens}`,
          );
        },
      });
      result = await exploreWithAgent(session.controller, agent, args.url, {
        scope: args.scope,
        maxActions: args.maxActions,
        observeNetwork: args.observeNetwork,
        aiProvider,
        strategy: args.strategy,
        log: (line) => console.error(`  ${line}`),
      });
      const totalCached = totalCacheRead + totalCacheCreation;
      if (totalCached > 0) {
        const hitRate = totalCached === 0 ? 0 : totalCacheRead / totalCached;
        console.error(
          `  ✓ Agent totals: input=${totalInput} cache_read=${totalCacheRead} cache_create=${totalCacheCreation} output=${totalOutput} (cache hit ${(hitRate * 100).toFixed(1)}%)`,
        );
      }
    } else {
      result = await exploreWithController(session.controller, args.url, {
        scope: args.scope,
        maxDepth: args.maxDepth,
        maxActions: args.maxActions,
        maxRoutes: args.maxRoutes,
        maxRescans: args.maxRescans,
        strategy: args.strategy,
        observeNetwork: args.observeNetwork,
        aiProvider,
      });
    }

    const routes = manifestsToRoutes(result.manifests);
    const pageFiles = emitRoutesToFiles(routes);
    let hasDrift = false;

    if (graphPath) {
      if (args.check) {
        hasDrift = await checkJsonFile(graphPath, result.graph, normalizeGraphForCheck, "Exploration graph") || hasDrift;
      } else {
        const graphJson = JSON.stringify(result.graph, null, 2) + "\n";
        hasDrift = await writeOrCheckFile(graphPath, graphJson, false, "Exploration graph") || hasDrift;
      }
    }

    if (manifestDir) {
      if (!args.check) await mkdir(manifestDir, { recursive: true });
      for (const route of routes) {
        const filePath = join(manifestDir, `${route.route}.manifest.json`);
        if (args.check) {
          hasDrift = await checkJsonFile(filePath, route.manifest, normalizeManifestForCheck, `Manifest ${route.route}`) || hasDrift;
        } else {
          const json = JSON.stringify(route.manifest, null, 2) + "\n";
          hasDrift = await writeOrCheckFile(filePath, json, false, `Manifest ${route.route}`) || hasDrift;
        }
      }
    }

    if (pagesDir) {
      if (!args.check) await mkdir(pagesDir, { recursive: true });
      for (const [filename, source] of pageFiles) {
        const filePath = join(pagesDir, filename);
        if (args.check && existsSync(filePath)) {
          const existing = await readFile(filePath, "utf-8");
          const diff = diffPageObjects(source, existing);
          if (!diff.unchanged) {
            console.log(`\n─── ${filename} ───`);
            console.log(formatEmitterDiff(diff));
            hasDrift = true;
          }
        } else {
          hasDrift = await writeOrCheckFile(filePath, source, args.check, `Page object ${filename}`) || hasDrift;
        }
      }
    }

    if (!graphPath && !manifestDir && !pagesDir) {
      console.log(JSON.stringify({
        graph: result.graph,
        manifests: Object.fromEntries(result.manifests),
      }, null, 2));
    }

    console.error(`  ✓ Explored ${result.graph.states.length} state(s), ${result.graph.actions.length} action(s), ${routes.length} route(s)`);

    if (args.check) {
      if (hasDrift) {
        console.log("\n✗ Exploration drift detected.");
        process.exit(1);
      }
      console.log("✓ Exploration outputs match existing files.");
      process.exit(0);
    }
  } finally {
    await session.dispose();
  }
}

// ── Drift mode ──────────────────────────────────────────────

async function runDrift(args: DriftArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error("Error: URL is required. Use --help for usage information.");
    process.exit(1);
  }

  if (!args.graph) {
    console.error("Error: --graph <file> is required for drift mode.");
    process.exit(1);
  }

  let graph;
  try {
    graph = await loadExplorationGraph(args.graph);
  } catch (err) {
    if (err instanceof GraphValidationError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  let baselines: Map<string, CrawlerManifest> | undefined;
  if (args.manifests) {
    try {
      baselines = await loadBaselineManifests(args.manifests);
    } catch (err) {
      if (err instanceof GraphValidationError) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  const session = await openExploreSession({
    mcp: args.mcp,
    mcpCdpPort: args.mcpCdpPort,
    headless: args.headless,
    ignoreHTTPSErrors: args.ignoreHTTPSErrors,
    authState: args.authState,
  });

  if (args.repair && args.aiProvider !== "anthropic") {
    console.error(
      "Error: --repair currently requires --ai-provider anthropic. Other providers are planned for a future slice.",
    );
    await session.dispose();
    process.exit(1);
  }

  let report: DriftReport;
  let repairReportPath: string | undefined;
  try {
    let aiProvider: AiProvider | undefined;
    if (args.aiProvider) {
      const { createAiProvider } = await import("../src/ai/provider.js");
      aiProvider = await createAiProvider({
        provider: args.aiProvider,
        model: args.aiModel,
        apiKey: args.aiKey,
        baseUrl: args.aiBaseUrl,
      });
    }

    const transportLabel = args.mcp ? " via MCP" : "";
    console.error(`  ● Replaying ${args.graph} against ${args.url}${transportLabel}…`);
    report = await replayGraph(session.controller, graph, {
      baselines,
      scope: args.scope,
      observeNetwork: args.observeNetwork,
      aiProvider,
      maxPaths: args.maxPaths,
    });

    if (args.repair && report.summary.pathsFailed > 0) {
      console.error(`  ● Asking repair agent to suggest fixes for ${report.summary.pathsFailed} failed path(s)…`);
      const repairAgent = createAnthropicRepairAgent({
        apiKey: args.aiKey,
        model: args.aiModel,
        baseUrl: args.aiBaseUrl,
        onUsage: (usage) => {
          console.error(
            `  repair usage: input=${usage.inputTokens} cache_read=${usage.cacheReadInputTokens} cache_create=${usage.cacheCreationInputTokens} output=${usage.outputTokens}`,
          );
        },
      });

      const repairReport = await suggestRepairs(session.controller, graph, report, repairAgent, {
        scope: args.scope,
        graphFile: args.graph,
        log: (line) => console.error(`  ${line}`),
      });

      const outPath = args.repairOutput
        ? resolve(args.repairOutput)
        : args.output
          ? resolve(dirname(resolve(args.output)), "repair-suggestions.json")
          : resolve("repair-suggestions.json");
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(repairReport, null, 2) + "\n", "utf-8");
      repairReportPath = outPath;
      console.error(
        `  ✓ Repair suggestions written to ${outPath} (${repairReport.summary.repaired} repaired, ${repairReport.summary.gaveUp} gave up, ${repairReport.summary.unreachable} unreachable)`,
      );
    } else if (args.repair) {
      console.error("  ✓ No failed paths — skipping repair pass.");
    }
  } finally {
    await session.dispose();
  }

  if (args.output) {
    const outputPath = resolve(args.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
    console.error(`  ✓ Drift report written to ${outputPath}`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDriftReport(report));
    if (repairReportPath) {
      console.log(`Repair suggestions: ${repairReportPath}`);
    }
  }

  process.exit(report.unchanged ? 0 : 1);
}

function manifestsToRoutes(manifests: Map<string, CrawlerManifest>): RouteManifest[] {
  const routes: RouteManifest[] = [];
  const used = new Set<string>();

  for (const [routeTemplate, manifest] of manifests) {
    let route = inferRouteName(routeTemplate);
    if (used.has(route)) {
      let n = 2;
      while (used.has(`${route}${n}`)) n++;
      route = `${route}${n}`;
    }
    used.add(route);
    routes.push({ route, manifest });
  }

  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

function emitRoutesToFiles(routes: RouteManifest[]): Map<string, string> {
  const emitOptions = {
    frameworkImport: "@playwright-elements/core",
    generatedMarkers: true,
    emitWaitForReady: true,
  };

  if (routes.length === 1) {
    const route = routes[0];
    return new Map([[`${route.route}.ts`, emitPageObject(route.manifest, {
      ...emitOptions,
      routeName: route.route,
    })]]);
  }

  return emitMultiRoute(routes, emitOptions);
}

async function writeOrCheckFile(filePath: string, content: string, check: boolean, label: string): Promise<boolean> {
  if (check) {
    if (!existsSync(filePath)) {
      console.log(`⚠ Missing ${label}: ${filePath}`);
      return true;
    }
    const existing = await readFile(filePath, "utf-8");
    if (existing !== content) {
      console.log(`⚠ Changed ${label}: ${filePath}`);
      return true;
    }
    return false;
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
  console.error(`  ✓ ${filePath}`);
  return false;
}

async function checkJsonFile<T>(
  filePath: string,
  generated: T,
  normalize: (value: T) => unknown,
  label: string,
): Promise<boolean> {
  if (!existsSync(filePath)) {
    console.log(`⚠ Missing ${label}: ${filePath}`);
    return true;
  }

  try {
    const existing = safeJsonParse<T>(await readFile(filePath, "utf-8"), filePath);
    const existingJson = JSON.stringify(normalize(existing), null, 2) + "\n";
    const generatedJson = JSON.stringify(normalize(generated), null, 2) + "\n";
    if (existingJson !== generatedJson) {
      console.log(`⚠ Changed ${label}: ${filePath}`);
      return true;
    }
    return false;
  } catch {
    console.log(`⚠ Invalid ${label}: ${filePath}`);
    return true;
  }
}

function normalizeManifestForCheck(manifest: CrawlerManifest): unknown {
  return JSON.parse(JSON.stringify({
    ...manifest,
    timestamp: "<timestamp>",
    groups: manifest.groups.map((group) => ({ ...group, lastSeen: "<timestamp>" })),
  })) as unknown;
}

function normalizeGraphForCheck(graph: unknown): unknown {
  return JSON.parse(JSON.stringify(graph, (_key, value) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return "<timestamp>";
    return value;
  })) as unknown;
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "generate") {
    return runGenerate(args);
  }

  if (args.mode === "record") {
    return runRecord(args);
  }

  if (args.mode === "explore") {
    return runExplore(args);
  }

  if (args.mode === "drift") {
    return runDrift(args);
  }

  // ── Crawl mode (existing behavior) ─────────────────────
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error("Error: URL is required. Use --help for usage information.");
    process.exit(1);
  }

  const launchArgs = args.ignoreHTTPSErrors ? ["--ignore-certificate-errors"] : [];
  const browser = await chromium.launch({
    headless: args.headless,
    args: launchArgs,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: args.ignoreHTTPSErrors });
    const page = await context.newPage();

    // ── Diff mode ─────────────────────────────────────────
    if (args.diff) {
      const diffPath = resolve(args.diff);
      if (!existsSync(diffPath)) {
        console.error(`Error: Manifest file not found: ${diffPath}`);
        process.exit(1);
      }
      const existingRaw = await readFile(diffPath, "utf-8");
      const existing = validateManifest(safeJsonParse(existingRaw, diffPath), diffPath);

      await page.goto(args.url, { waitUntil: "domcontentloaded" });
      const diff = await diffPage(page, existing, { scope: args.scope });

      if (diff.unchanged) {
        console.log("✓ Manifest matches current DOM — no drift detected.");
        process.exit(0);
      }

      console.log("⚠ Manifest drift detected:\n");

      if (diff.added.length > 0) {
        console.log(`  Added (${diff.added.length}):`);
        for (const g of diff.added) {
          console.log(`    + [${g.wrapperType}] "${g.label}" (${g.selector})`);
        }
      }

      if (diff.removed.length > 0) {
        console.log(`\n  Removed (${diff.removed.length}):`);
        for (const g of diff.removed) {
          console.log(`    - [${g.wrapperType}] "${g.label}" (${g.selector})`);
        }
      }

      if (diff.changed.length > 0) {
        console.log(`\n  Changed (${diff.changed.length}):`);
        for (const c of diff.changed) {
          console.log(`    ~ "${c.before.label}" → "${c.after.label}" (${c.mergeKey})`);
        }
      }

      process.exit(1);
    }

    // ── Crawl mode ────────────────────────────────────────
    let existing: CrawlerManifest | null = null;

    // Load existing manifest if output file exists and pass > 1
    if (args.output && args.pass > 1) {
      const outputPath = resolve(args.output);
      if (existsSync(outputPath)) {
        const raw = await readFile(outputPath, "utf-8");
        existing = safeJsonParse<CrawlerManifest>(raw, outputPath);
      }
    }

    await page.goto(args.url, { waitUntil: "domcontentloaded" });

    // Resolve AI provider if requested
    let aiProvider: AiProvider | undefined;
    if (args.aiProvider) {
      const { createAiProvider } = await import("../src/ai/provider.js");
      aiProvider = await createAiProvider({
        provider: args.aiProvider,
        model: args.aiModel,
        apiKey: args.aiKey,
        baseUrl: args.aiBaseUrl,
      });
    }

    const manifest = await crawlPage(
      page,
      {
        scope: args.scope,
        pass: args.pass,
        observeNetwork: args.observeNetwork,
        aiProvider,
      },
      existing,
    );

    const json = JSON.stringify(manifest, null, 2);

    if (args.output) {
      const outputPath = resolve(args.output);
      await writeFile(outputPath, json + "\n", "utf-8");
      console.error(`✓ Manifest written to ${outputPath}`);
      console.error(`  Groups: ${manifest.groups.length}`);
      console.error(`  Pass: ${manifest.passCount}`);
      if (manifest.apiDependencies?.length) {
        console.error(`  API dependencies: ${manifest.apiDependencies.length}`);
      }
    } else {
      console.log(json);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Crawl failed:", err.message ?? err);
  process.exit(1);
});
