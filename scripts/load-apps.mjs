/**
 * Load APP_DEFINITIONS from shared/apps.ts using esbuild's transform API.
 * Avoids hardcoding the app list in scripts — single source of truth.
 */
import { transform } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadAppDefinitions() {
  const tsPath = resolve(__dirname, "../shared/apps.ts");

  let tsCode;
  try {
    tsCode = readFileSync(tsPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${tsPath}: ${err.message}`);
  }

  let code;
  try {
    ({ code } = await transform(tsCode, { loader: "ts", format: "esm" }));
  } catch (err) {
    throw new Error(`Failed to transform shared/apps.ts: ${err.message}`);
  }

  const dataUri = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  const mod = await import(dataUri);

  if (!mod.APP_DEFINITIONS) {
    throw new Error(
      `shared/apps.ts does not export APP_DEFINITIONS. Found exports: ${Object.keys(mod).join(", ") || "(none)"}`,
    );
  }

  if (!Array.isArray(mod.APP_DEFINITIONS)) {
    throw new Error(
      `APP_DEFINITIONS must be an array, got ${typeof mod.APP_DEFINITIONS}`,
    );
  }

  // P3-88: Validate each entry has required name/port/prefix fields.
  for (let i = 0; i < mod.APP_DEFINITIONS.length; i++) {
    const entry = mod.APP_DEFINITIONS[i];
    if (!entry || typeof entry.name !== "string" || typeof entry.port !== "number" || typeof entry.prefix !== "string") {
      throw new Error(
        `APP_DEFINITIONS[${i}] must have string "name", number "port", and string "prefix" — got: ${JSON.stringify(entry)}`,
      );
    }
  }

  return mod.APP_DEFINITIONS;
}
