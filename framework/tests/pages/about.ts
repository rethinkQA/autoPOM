import type { Page } from "@playwright/test";
import { By, group, text } from "../../src/index.js";

/**
 * About page — root GroupElement (body) for page-level label scanning,
 * plus explicit outputs that lack labels.
 */
export function aboutPage(page: Page) {
  const root = group(By.css("body"), page);

  return {
    ...root,
    aboutText: text(By.css(".about-text"), page),
  };
}
