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
import type { CrawlerManifest } from "../src/types.js";
import type { EmitterConfig, RouteManifest } from "../src/emitter-types.js";

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

type CliArgs = CrawlArgs | GenerateArgs;

function parseCrawlArgs(argv: string[]): CrawlArgs {
  const args: CrawlArgs = {
    mode: "crawl",
    url: "",
    pass: 1,
    observeNetwork: false,
    headless: true,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "-o":
      case "--output":
        args.output = argv[++i];
        break;
      case "--pass":
        args.pass = parseInt(argv[++i], 10);
        if (isNaN(args.pass) || args.pass < 1) {
          console.error("Error: --pass must be a positive integer");
          process.exit(1);
        }
        break;
      case "--scope":
        args.scope = argv[++i];
        break;
      case "--diff":
        args.diff = argv[++i];
        break;
      case "--observe-network":
        args.observeNetwork = true;
        break;
      case "--headed":
        args.headless = false;
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
        args.output = argv[++i];
        break;
      case "--check":
        args.check = argv[++i];
        break;
      case "--config":
        args.configFile = argv[++i];
        break;
      case "--framework-import":
        args.frameworkImport = argv[++i];
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
  // Check if first positional arg is "generate"
  if (argv[0] === "generate") {
    return parseGenerateArgs(argv.slice(1));
  }
  return parseCrawlArgs(argv);
}

function printHelp(): void {
  console.log(`
pw-crawl — Runtime page crawler and page object generator for @playwright-elements

Usage:
  pw-crawl <url> [options]                         Crawl a page
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
    config = JSON.parse(raw);
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
    const manifest: CrawlerManifest = JSON.parse(raw);

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

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "generate") {
    return runGenerate(args);
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

  const browser = await chromium.launch({ headless: args.headless });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // ── Diff mode ─────────────────────────────────────────
    if (args.diff) {
      const diffPath = resolve(args.diff);
      if (!existsSync(diffPath)) {
        console.error(`Error: Manifest file not found: ${diffPath}`);
        process.exit(1);
      }
      const existingRaw = await readFile(diffPath, "utf-8");
      const existing: CrawlerManifest = JSON.parse(existingRaw);

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
          console.log(`    ~ "${c.before.label}" → "${c.after.label}" (${c.selector})`);
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
        existing = JSON.parse(raw);
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
