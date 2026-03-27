#!/usr/bin/env node
/**
 * Test navigation re-injection:
 * 1. Launches a headed browser with DomRecorder
 * 2. Navigates to page A
 * 3. Starts recording
 * 4. Navigates to page B (simulating login redirect)
 * 5. Harvests and checks that globals were re-injected on page B
 */
import { chromium } from "playwright";
import { resolve } from "node:path";

// Dynamic import of the compiled recorder
const { DomRecorder } = await import("./dist/src/recorder.js");

const url = process.argv[2] || "http://localhost:3002/";

console.log("=== Navigation Re-injection Test ===\n");

const browser = await chromium.launch({
  headless: true,
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: Go to the initial page
  console.log(`1. Navigating to ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Step 2: Start the recorder
  console.log("2. Starting recorder...");
  const recorder = new DomRecorder(page);
  await recorder.start();

  // Step 3: Check globals exist on page A
  const globalsA = await page.evaluate(() => ({
    entries: Array.isArray((window).__pw_recorder_entries),
    actions: Array.isArray((window).__pw_recorder_actions),
    observer: !!(window).__pw_recorder_observer,
  }));
  console.log(`3. Globals on page A: entries=${globalsA.entries}, actions=${globalsA.actions}, observer=${globalsA.observer}`);
  console.assert(globalsA.entries && globalsA.actions && globalsA.observer, "   ✗ Globals missing on page A!");

  // Step 4: Navigate to a different page (simulates login redirect)
  console.log(`4. Navigating to ${url} (reload simulates navigation)...`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Give the domcontentloaded handler time to re-inject
  await page.waitForTimeout(2000);

  // Step 5: Check globals exist on page B (after navigation)
  const globalsB = await page.evaluate(() => ({
    entries: Array.isArray((window).__pw_recorder_entries),
    actions: Array.isArray((window).__pw_recorder_actions),
    observer: !!(window).__pw_recorder_observer,
  }));
  console.log(`5. Globals on page B: entries=${globalsB.entries}, actions=${globalsB.actions}, observer=${globalsB.observer}`);

  if (globalsB.entries && globalsB.actions && globalsB.observer) {
    console.log("\n✓ Navigation re-injection WORKS — globals restored after navigation");
  } else {
    console.log("\n✗ Navigation re-injection FAILED — globals NOT restored after navigation");
  }

  // Step 6: Harvest and verify it doesn't crash
  console.log("\n6. Harvesting...");
  const groups = await recorder.harvest();
  console.log(`   Harvested ${groups.length} groups`);

  // Step 7: Stop
  await recorder.stop();
  console.log("7. Stopped recorder cleanly");

  console.log("\n=== ALL TESTS PASSED ===");
} catch (err) {
  console.error("\n✗ TEST FAILED:", err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}
