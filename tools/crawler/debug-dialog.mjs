import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3002", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Click first product to open dialog
await page.locator("button.view-details-btn").first().click();
await page.waitForTimeout(800);

// Inspect the dialog element directly
const dialogInfo = await page.evaluate(() => {
  const el = document.querySelector('[role="dialog"]');
  if (!el) return { error: "NO DIALOG FOUND" };

  const h = el.querySelector("h1, h2, h3, h4, h5, h6");
  const directH = el.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");

  // Walk text nodes
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let n = walker.nextNode();
  while (n && textNodes.length < 5) {
    const t = n.textContent?.trim();
    if (t && t.length >= 2) textNodes.push(t);
    n = walker.nextNode();
  }

  // Check parent for aria-label
  let ancestorLabel = null;
  let anc = el.parentElement;
  while (anc && anc !== document.body) {
    const al = anc.getAttribute("aria-label");
    if (al) { ancestorLabel = al; break; }
    anc = anc.parentElement;
  }

  return {
    tagName: el.tagName,
    id: el.getAttribute("id"),
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
    ariaLabelledBy: el.getAttribute("aria-labelledby"),
    directHeading: directH?.textContent ?? null,
    deepHeading: h?.textContent ?? null,
    headingTag: h?.tagName ?? null,
    ancestorLabel,
    textNodes,
    childCount: el.children.length,
    firstChildTag: el.children[0]?.tagName ?? null,
    firstChildClass: el.children[0]?.className ?? null,
    outerHTML: el.outerHTML.substring(0, 600),
  };
});

console.log(JSON.stringify(dialogInfo, null, 2));
await browser.close();
