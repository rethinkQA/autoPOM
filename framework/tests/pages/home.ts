import type { Page } from "@playwright/test";
import { By, group, table, button, text, stepper, datePicker, radio, dialog, toast } from "../../src/index.js";
import type { DatePickerAdapter } from "../../src/index.js";

export interface HomePageOptions {
  datePickerAdapter?: DatePickerAdapter;
}

/**
 * Home page — the page itself is a root GroupElement (body).
 * Provides page-level write/read/writeAll/readAll/click for any labeled element,
 * plus scoped sub-containers for ambiguity or specialized interactions.
 */
export function homePage(page: Page, options?: HomePageOptions) {
  const root = group(By.css("body"), page);

  return {
    // ── Page-level label scanning ────────────────────────────
    ...root,

    // ── Scoped containers (narrowed search area) ─────────────
    filters: group(By.css(".filter-bar"), page),

    // ── Typed containers (specialized interactions) ──────────
    productTable: table(By.role("table"), page),
    shipping: radio(By.role("group", { name: "Shipping Method" }), page),
    quantity: stepper(By.css(".stepper"), page),
    deliveryDate: datePicker(By.label("Choose a date"), page, {
      adapter: options?.datePickerAdapter,
    }),
    addToCart: button(By.css(".action-area button"), page),

    // ── Read-only outputs (no labels — need explicit By) ─────
    actionOutput: text(By.css(".action-output"), page),
    shippingCost: text(By.css(".radio-output"), page),
    dateDisplay: text(By.css(".date-output"), page),
    validationMsg: text(By.css(".validation-message"), page),
    delayedContent: text(By.css(".section [aria-live='polite']"), page),
    itemList: text(By.css(".item-list"), page),

    // ── Modal / Dialog ───────────────────────────────────────
    modal: dialog(By.role("dialog"), page),

    // ── Toast ────────────────────────────────────────────────
    toast: toast(By.css(".toast[aria-live='polite']"), page),
  };
}
