/**
 * App-specific configuration for cross-app testing.
 *
 * Maps Playwright project names to the correct technology adapters
 * so tests can use `homePage(page, appConfig(testInfo))` to get
 * the right date picker, dialog, etc. for each app.
 */
import type { TestInfo } from "@playwright/test";
import {
  nativeDatePickerAdapter,
  reactDatePickerAdapter,
  vueDatePickerAdapter,
  matDatePickerAdapter,
  flatpickrAdapter,
} from "../../src/index.js";
import type { HomePageOptions } from "./home.js";

const adapterMap: Record<string, HomePageOptions> = {
  vanilla: {},
  react:   { datePickerAdapter: reactDatePickerAdapter },
  vue:     { datePickerAdapter: vueDatePickerAdapter },
  angular: { datePickerAdapter: matDatePickerAdapter },
  svelte:  { datePickerAdapter: flatpickrAdapter },
  nextjs:  { datePickerAdapter: reactDatePickerAdapter },
  lit:     { datePickerAdapter: nativeDatePickerAdapter },
};

/**
 * Return the correct page-object options for the current Playwright project.
 *
 * Usage:
 * ```ts
 * import { appConfig } from "./pages/app-config.js";
 * const home = homePage(page, appConfig(testInfo));
 * ```
 */
export function appConfig(testInfo: TestInfo): HomePageOptions {
  const project = testInfo.project.name;
  return adapterMap[project] ?? {};
}
