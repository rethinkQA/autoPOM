/**
 * Multi-pass crawler demo — React app (port 3002)
 *
 * Demonstrates how the crawler discovers NEW groups that only
 * appear after user interaction (dialog, toast).
 *
 * Usage:
 *   node demo-multipass.mjs
 *
 * Requires: React app running on localhost:3002
 */

import { chromium } from "playwright";
import { crawlPage } from "./dist/src/index.js";

const URL = "http://localhost:3002";

function printManifest(label, manifest) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  URL:       ${manifest.url}`);
  console.log(`  Pass:      ${manifest.passCount}`);
  console.log(`  Groups:    ${manifest.groups.length}`);
  console.log(`  ─────────────────────────────────────────────`);
  for (const g of manifest.groups) {
    const tag = g.discoveredIn.padEnd(8);
    const vis = g.visibility.padEnd(8);
    console.log(`  [${tag}] ${vis} ${g.wrapperType.padEnd(7)} "${g.label}" → ${g.selector}`);
  }
  console.log();
}

(async () => {
  console.log("Launching browser (headed so you can watch)...\n");
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();

  // Navigate
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // ── PASS 1: Page at rest ──────────────────────────────────
  console.log("▶ PASS 1 — crawling page at rest...");
  let manifest = await crawlPage(page, { pass: 1 });
  printManifest("PASS 1 — Static page (no interactions)", manifest);

  const pass1Count = manifest.groups.length;
  console.log(`  → Found ${pass1Count} groups. Dialog & toast NOT in DOM yet.\n`);

  // ── User interaction: open dialog ─────────────────────────
  console.log("▶ Clicking first product to open MUI Dialog...");
  const firstProduct = page.locator("button.view-details-btn").first();
  await firstProduct.click();
  await page.waitForTimeout(800); // Let React render the portal

  // ── PASS 2: Dialog is now in DOM ──────────────────────────
  console.log("▶ PASS 2 — crawling with dialog open...");
  manifest = await crawlPage(page, { pass: 2 }, manifest);
  printManifest("PASS 2 — After opening dialog", manifest);

  const pass2Count = manifest.groups.length;
  const newInPass2 = manifest.groups.filter(g => g.discoveredIn === "pass-2");
  console.log(`  → Total groups: ${pass2Count} (was ${pass1Count})`);
  console.log(`  → NEW in pass-2: ${newInPass2.length} group(s): ${newInPass2.map(g => `"${g.label}"`).join(", ")}\n`);

  // Close the dialog
  const closeBtn = page.locator('button[aria-label="Close dialog"]');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }

  // ── User interaction: trigger toast ───────────────────────
  console.log("▶ Clicking 'Add to Cart' to trigger toast...");
  const addBtn = page.locator("button.btn-primary.btn-sm").first();
  await addBtn.click();
  await page.waitForTimeout(1000); // Let toast appear

  // ── PASS 3: Toast is now in DOM ───────────────────────────
  console.log("▶ PASS 3 — crawling with toast visible...");
  manifest = await crawlPage(page, { pass: 3 }, manifest);
  printManifest("PASS 3 — After triggering toast", manifest);

  const pass3Count = manifest.groups.length;
  const newInPass3 = manifest.groups.filter(g => g.discoveredIn === "pass-3");
  console.log(`  → Total groups: ${pass3Count} (was ${pass2Count})`);
  console.log(`  → NEW in pass-3: ${newInPass3.length} group(s): ${newInPass3.map(g => `"${g.label}"`).join(", ")}\n`);

  // ── Summary ───────────────────────────────────────────────
  console.log("═".repeat(60));
  console.log("  SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Pass 1 (at rest):       ${pass1Count} groups`);
  console.log(`  Pass 2 (dialog open):   ${pass2Count} groups (+${pass2Count - pass1Count} new)`);
  console.log(`  Pass 3 (toast visible): ${pass3Count} groups (+${pass3Count - pass2Count} new)`);
  console.log(`  Final passCount:        ${manifest.passCount}`);
  console.log();

  // Show which pass discovered each group
  console.log("  Discovery timeline:");
  for (const g of manifest.groups) {
    console.log(`    ${g.discoveredIn} → "${g.label}" (${g.wrapperType})`);
  }
  console.log();

  await browser.close();
  console.log("✓ Demo complete. Browser closed.");
})();
