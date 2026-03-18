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
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const entryCode = `export * from './data';\nexport * from './logic';\n`;

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
writeFileSync(outPath, banner + code, 'utf-8');

console.log(`✓ Generated ${outPath}`);
