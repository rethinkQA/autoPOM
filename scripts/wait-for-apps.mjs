#!/usr/bin/env node

/**
 * Health-check script: polls each app server until all respond with HTTP 200,
 * then exits 0. Exits 1 if any server fails to respond within the timeout.
 *
 * Usage:
 *   node scripts/wait-for-apps.mjs [--timeout 60000] [--interval 1000]
 *
 * Environment:
 *   HEALTH_TIMEOUT_MS — override default timeout  (default: 60 000 ms)
 *   HEALTH_INTERVAL_MS — override poll interval    (default: 1 000 ms)
 */

import http from "node:http";

const APPS = [
  { name: "vanilla-html", port: 3001 },
  { name: "react-app", port: 3002 },
  { name: "vue-app", port: 3003 },
  { name: "angular-app", port: 3004 },
  { name: "svelte-app", port: 3005 },
  { name: "nextjs-app", port: 3006 },
  { name: "lit-app", port: 3007 },
];

// --- CLI / env config -------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let timeout = Number(process.env.HEALTH_TIMEOUT_MS) || 60_000;
  let interval = Number(process.env.HEALTH_INTERVAL_MS) || 1_000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--timeout" && args[i + 1]) timeout = Number(args[++i]);
    if (args[i] === "--interval" && args[i + 1]) interval = Number(args[++i]);
  }
  return { timeout, interval };
}

// --- HTTP probe -------------------------------------------------------

/** Resolves `true` if the server responds with any 2xx/3xx status. */
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      res.resume(); // drain
      resolve(res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2_000, () => {
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
