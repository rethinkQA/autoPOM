#!/usr/bin/env node
/**
 * Generate apps/vanilla-html/shared.js from the canonical shared/ TypeScript sources.
 *
 * This eliminates the silent-divergence risk: vanilla-html no longer carries
 * hand-maintained copies of data and logic.  The generated IIFE exposes
 * everything as `window.Shared` (e.g. Shared.PRODUCTS, Shared.cartMessage).
 *
 * Usage:
 *   node scripts/generate-vanilla-shared.mjs          # from repo root
 *   node ../../scripts/generate-vanilla-shared.mjs     # from apps/vanilla-html
 */

import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const entryCode = `export * from './data';\nexport * from './logic';\n`;

try {
  const result = buildSync({
    stdin: {
      contents: entryCode,
      resolveDir: resolve(repoRoot, 'shared'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'Shared',
    write: false,
    target: 'es2020',
    logLevel: 'warning',
  });

  if (!result.outputFiles || result.outputFiles.length === 0) {
    console.error('✗ esbuild produced no output files. Check shared/data.ts and shared/logic.ts for errors.');
    process.exit(1);
  }

  const code = result.outputFiles[0].text;

  // Prepend a banner so people don't edit the generated file
  const banner = [
    '// ============================================================',
    '// AUTO-GENERATED — do not edit by hand.',
    '// Source of truth: shared/data.ts + shared/logic.ts',
    '// Regenerate: node scripts/generate-vanilla-shared.mjs',
    '// ============================================================',
    '',
  ].join('\n');

  const outPath = resolve(repoRoot, 'apps/vanilla-html/shared.js');
  const generated = banner + code;

  // P3-191: --check mode for CI — verify generated file isn't stale
  if (process.argv.includes('--check')) {
    let existing = '';
    try { existing = readFileSync(outPath, 'utf-8'); } catch { /* missing file = stale */ }
    if (existing === generated) {
      console.log(`✓ ${outPath} is up to date`);
    } else {
      console.error(`✗ ${outPath} is stale. Run: node scripts/generate-vanilla-shared.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(outPath, generated, 'utf-8');
    console.log(`✓ Generated ${outPath}`);
  }
} catch (err) {
  console.error('✗ Failed to generate vanilla-html/shared.js:', err.message);
  process.exit(1);
}
