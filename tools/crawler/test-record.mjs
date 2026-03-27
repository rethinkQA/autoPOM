#!/usr/bin/env node
/**
 * Quick smoke test for record mode:
 * 1. Spawns pw-crawl record against a local URL
 * 2. Waits for the "Recording" message
 * 3. Sends SIGINT after a delay
 * 4. Checks that the manifest file was written
 */
import { spawn } from "node:child_process";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.argv[2] || "http://localhost:3002/";
const outFile = resolve("/tmp/test-record-manifest.json");

// Clean up any previous output
if (existsSync(outFile)) unlinkSync(outFile);

console.log(`Testing record mode against ${url}`);
console.log(`Output: ${outFile}\n`);

const child = spawn(
  "node",
  [resolve("dist/bin/pw-crawl.js"), "record", url, "-o", outFile],
  { cwd: resolve(import.meta.dirname, ".."), stdio: ["pipe", "pipe", "pipe"] }
);

let stderr = "";
let stdout = "";

child.stderr.on("data", (d) => {
  const text = d.toString();
  stderr += text;
  process.stderr.write(text);
});
child.stdout.on("data", (d) => {
  const text = d.toString();
  stdout += text;
  process.stdout.write(text);
});

// Wait for the "Recording" message, then give it a few seconds, then SIGINT
const checkInterval = setInterval(() => {
  if (stderr.includes("Recording")) {
    clearInterval(checkInterval);
    console.log("\n--- Detected 'Recording' message, waiting 8s then sending SIGINT ---\n");
    setTimeout(() => {
      console.log("--- Sending SIGINT ---\n");
      child.kill("SIGINT");
    }, 8000);
  }
}, 500);

child.on("close", (code) => {
  console.log(`\n--- Process exited with code ${code} ---\n`);

  if (existsSync(outFile)) {
    const content = readFileSync(outFile, "utf-8");
    try {
      const manifest = JSON.parse(content);
      console.log(`✓ Manifest written successfully!`);
      console.log(`  Groups: ${manifest.groups?.length ?? 0}`);
      console.log(`  Pass count: ${manifest.passCount}`);
      console.log(`  URL: ${manifest.url}`);
    } catch {
      console.log(`✗ Manifest file exists but is not valid JSON`);
    }
  } else {
    console.log(`✗ Manifest file was NOT written — this is the bug!`);
  }
});

// Safety timeout — if nothing happens in 30s, bail
setTimeout(() => {
  console.log("\n--- Timeout: killing process ---");
  child.kill("SIGKILL");
}, 30000);
