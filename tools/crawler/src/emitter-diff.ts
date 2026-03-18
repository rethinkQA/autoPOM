/**
 * Emitter diff — compare generated page object against existing file.
 *
 * Extracts property declarations from both generated and existing TypeScript
 * page objects and reports additions, removals, and changes. Used for
 * `--check` CI mode.
 */

import type { EmitterDiff } from "./emitter-types.js";

/**
 * Extract property names and their factory expressions from a page object source.
 *
 * Looks for patterns like:
 *   propName: factory(By.something(...), page),
 *   ...root,
 *
 * Returns a Map from property name → full expression.
 */
export function extractProperties(source: string): Map<string, string> {
  const props = new Map<string, string>();

  // Match property declarations: `propName: factory(...)` or `propName: factory(...),`
  const propRegex = /^\s+(\w+):\s*(.+?),?\s*(?:\/\/.*)?$/gm;

  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(source)) !== null) {
    const name = match[1];
    const expr = match[2].trim().replace(/,$/, "");

    // Skip spread patterns and comments
    if (name === "return" || name === "const") continue;

    props.set(name, expr);
  }

  return props;
}

/**
 * Compare a generated page object source against an existing source.
 *
 * Returns a diff describing what properties were added, removed, or changed.
 */
export function diffPageObjects(
  generated: string,
  existing: string,
): EmitterDiff {
  const genProps = extractProperties(generated);
  const existProps = extractProperties(existing);

  const addedProperties: string[] = [];
  const removedProperties: string[] = [];
  const changedProperties: EmitterDiff["changedProperties"] = [];

  // Find added properties (in generated, not in existing)
  for (const [name, expr] of genProps) {
    if (!existProps.has(name)) {
      addedProperties.push(name);
    } else if (existProps.get(name) !== expr) {
      changedProperties.push({
        name,
        before: existProps.get(name)!,
        after: expr,
      });
    }
  }

  // Find removed properties (in existing, not in generated)
  for (const name of existProps.keys()) {
    if (!genProps.has(name)) {
      removedProperties.push(name);
    }
  }

  return {
    addedProperties,
    removedProperties,
    changedProperties,
    unchanged:
      addedProperties.length === 0 &&
      removedProperties.length === 0 &&
      changedProperties.length === 0,
  };
}

/**
 * Format an EmitterDiff as a human-readable string.
 */
export function formatEmitterDiff(diff: EmitterDiff): string {
  if (diff.unchanged) {
    return "✓ Generated page object matches existing file — no drift detected.";
  }

  const lines: string[] = [];
  lines.push("⚠ Page object drift detected:\n");

  if (diff.addedProperties.length > 0) {
    lines.push(`  Added (${diff.addedProperties.length}):`);
    for (const name of diff.addedProperties) {
      lines.push(`    + ${name}`);
    }
  }

  if (diff.removedProperties.length > 0) {
    lines.push(`\n  Removed (${diff.removedProperties.length}):`);
    for (const name of diff.removedProperties) {
      lines.push(`    - ${name}`);
    }
  }

  if (diff.changedProperties.length > 0) {
    lines.push(`\n  Changed (${diff.changedProperties.length}):`);
    for (const change of diff.changedProperties) {
      lines.push(`    ~ ${change.name}:`);
      lines.push(`      before: ${change.before}`);
      lines.push(`      after:  ${change.after}`);
    }
  }

  return lines.join("\n");
}
