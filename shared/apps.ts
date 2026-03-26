/**
 * Canonical app definitions shared between Playwright configs.
 *
 * Both `framework/playwright.config.ts` and `tools/crawler/playwright.config.ts`
 * import this array so that adding/removing an app only requires changing one file.
 *
 * @module
 */

export interface AppDefinition {
  /** Short name used as the Playwright project identifier (e.g. "react"). */
  readonly name: string;
  /** Dev-server port (must match the app's `npm start` script). */
  readonly port: number;
  /** Directory name under `apps/` (e.g. "react-app"). */
  readonly prefix: string;
}

export const APP_DEFINITIONS: readonly AppDefinition[] = [
  { name: "vanilla",  port: 3001, prefix: "vanilla-html" },
  { name: "react",    port: 3002, prefix: "react-app" },
  { name: "vue",      port: 3003, prefix: "vue-app" },
  { name: "angular",  port: 3004, prefix: "angular-app" },
  { name: "svelte",   port: 3005, prefix: "svelte-app" },
  { name: "nextjs",   port: 3006, prefix: "nextjs-app" },
  { name: "lit",      port: 3007, prefix: "lit-app" },
] as const;
