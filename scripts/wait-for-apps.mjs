#!/usr/bin/env node

/**
 * Health-check script: polls each app server until all respond with HTTP 200,
 * then exits 0. Exits 1 if any server fails to respond within the timeout.
 *
 * NOTE: A successful HTTP response (status < 400) confirms server availability
 * but does NOT guarantee client-side readiness (e.g. JS hydration).  Dev servers
 * may return 200 before client bundles finish loading.  Playwright's test-level
 * auto-retry and `waitFor` assertions handle the client-readiness gap.
 *
 * Usage:
 *   node scripts/wait-for-apps.mjs [--timeout 60000] [--interval 1000]
 *
 * Environment:
 *   HEALTH_TIMEOUT_MS — override default timeout  (default: 60 000 ms)
 *   HEALTH_INTERVAL_MS — override poll interval    (default: 1 000 ms)
 */

import http from "node:http";
import { loadAppDefinitions } from "./load-apps.mjs";

const APP_DEFINITIONS = await loadAppDefinitions();
const APPS = APP_DEFINITIONS.map((a) => ({ name: a.prefix, port: a.port }));

// --- CLI / env config -------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let timeout = Number(process.env.HEALTH_TIMEOUT_MS) || 60_000;
  let interval = Number(process.env.HEALTH_INTERVAL_MS) || 1_000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--timeout" && args[i + 1]) {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) { console.error("--timeout must be a positive number"); process.exit(1); }
      timeout = v;
    }
    if (args[i] === "--interval" && args[i + 1]) {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v <= 0) { console.error("--interval must be a positive number"); process.exit(1); }
      interval = v;
    }
  }
  return { timeout, interval };
}

// --- HTTP probe -------------------------------------------------------

/** Resolves `true` if the server responds with HTTP 200–299. */
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      res.resume(); // drain
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// --- Main loop --------------------------------------------------------

async function main() {
  const { timeout, interval } = parseArgs();
  const deadline = Date.now() + timeout;
  const pending = new Set(APPS.map((a) => a.name));

  console.log(
    `⏳ Waiting for ${APPS.length} apps (timeout ${timeout / 1000}s)…`,
  );

  while (pending.size > 0) {
    if (Date.now() > deadline) {
      console.error(
        `\n❌ Timed out after ${timeout / 1000}s. Still waiting on: ${[...pending].join(", ")}`,
      );
      process.exit(1);
    }

    await Promise.all(
      APPS.filter((a) => pending.has(a.name)).map(async (app) => {
        const ok = await probe(app.port);
        if (ok) {
          pending.delete(app.name);
          console.log(`  ✔ ${app.name} (:${app.port}) ready`);
        }
      }),
    );

    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  console.log(`\n✅ All ${APPS.length} apps are up and healthy.`);
}

main();
