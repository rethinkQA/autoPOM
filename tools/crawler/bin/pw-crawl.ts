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
import { resolve, join, basename } from "node:path";
import { crawlPage, diffPage } from "../src/crawler.js";
import { emitPageObject, emitMultiRoute } from "../src/emitter.js";
import { diffPageObjects, formatEmitterDiff } from "../src/emitter-diff.js";
import { inferRouteName, labelToPropertyName } from "../src/naming.js";
import { DomRecorder } from "../src/recorder.js";
import type { PageRecording } from "../src/recorder.js";
import { mergeManifest } from "../src/merge.js";
import type { CrawlerManifest, ManifestGroup } from "../src/types.js";
import type { EmitterConfig, RouteManifest } from "../src/emitter-types.js";

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
}

type CliArgs = CrawlArgs | GenerateArgs | RecordArgs;

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
    observeNetwork: false,
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
      case "--headed":
        args.headless = false;
        break;
      case "--ignore-https-errors":
        args.ignoreHTTPSErrors = true;
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
  // Check if first positional arg is "generate" or "record"
  if (argv[0] === "generate") {
    return parseGenerateArgs(argv.slice(1));
  }
  if (argv[0] === "record") {
    return parseRecordArgs(argv.slice(1));
  }
  return parseCrawlArgs(argv);
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
  pw-crawl generate <manifests...> [options]       Generate page objects

── Crawl Mode ──────────────────────────────────────────────────

Arguments:
  <url>                    URL of the page to crawl (required)

Options:
  -o, --output <file>      Write manifest to file (default: stdout)
  --pass <n>               Pass number for append-only merge (default: 1)
  --scope <selector>       Limit crawl to elements within this CSS selector
  --diff <file>            Compare current DOM against existing manifest
  --observe-network        Capture API dependencies during crawl
  --headed                 Run browser in headed mode (visible)
  --ignore-https-errors    Skip TLS certificate validation

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
    const rawFromFilename = basename(manifestPath, ".json").replace(/-manifest$/, "");
    const route = rawFromFilename !== basename(manifestPath, ".json")
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
    const filename = `${route.route}-page.ts`;
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

    await page.goto(args.url, { waitUntil: "domcontentloaded" });

    const recorder = new DomRecorder(page);
    await recorder.start();

    console.error("  ● Recording — interact with the page to trigger dynamic elements.");
    console.error("  ● Navigate freely (login, follow links) — each page gets its own manifest.");
    console.error("  ● Press Ctrl+C when done to harvest and save.\n");

    // Wait until the user sends SIGINT (Ctrl+C)
    await new Promise<void>((resolve) => {
      const handler = () => {
        process.off("SIGINT", handler);
        resolve();
      };
      process.on("SIGINT", handler);
    });

    console.error("\n  ⏳ Harvesting recorded elements…");

    let pages: PageRecording[] = [];
    try {
      pages = await recorder.harvestByPage();
      await recorder.stop();
    } catch (harvestErr: unknown) {
      // Browser may be closing — fall back to accumulated data
      console.error(`  ⚠ Harvest error (using accumulated data): ${harvestErr instanceof Error ? harvestErr.message : harvestErr}`);
      pages = recorder.getAccumulatedPages();
    }

    const totalGroups = pages.reduce((n, p) => n + p.groups.length, 0);
    console.error(`  ✓ Recorded ${totalGroups} group(s) across ${pages.length} page(s)`);

    if (args.output) {
      // Write one manifest per page into the output directory.
      const outputDir = resolve(args.output);
      await mkdir(outputDir, { recursive: true });

      for (const recording of pages) {
        // Derive filename from the URL pathname
        const routeName = inferRouteName(recording.pathname);
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
          recording.pathname,
          (existing?.passCount ?? 0) + 1,
          args.scope ?? null,
        );

        await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
        console.error(`  ✓ ${fileName} — ${recording.groups.length} group(s)`);
      }

      console.error(`\n  Manifests written to ${outputDir}/`);
    } else {
      // No output flag — write all pages as a single JSON array to stdout
      const manifests = pages.map(recording =>
        mergeManifest(null, recording.groups, recording.pathname, 1, args.scope ?? null),
      );
      console.log(JSON.stringify(manifests, null, 2));
    }
  } finally {
    await browser.close();
  }
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

    const manifest = await crawlPage(
      page,
      {
        scope: args.scope,
        pass: args.pass,
        observeNetwork: args.observeNetwork,
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
