/**
 * Canonical business logic shared across all test-fixture apps.
 *
 * Pure, framework-agnostic functions for filtering, sorting, toast timing,
 * cart messages, and date formatting. Each app imports these and wires them
 * into its own state-management / reactivity layer.
 *
 * Vanilla-html consumes a generated IIFE bundle (see scripts/generate-vanilla-shared.mjs).
 *
 * @module
 */

import { type Product } from './data';

// ===== Types =====

/** Canonical sort keys — derived from Product field names to stay in sync. */
export type SortKey = keyof Product;

export interface FilterCriteria {
  searchTerm: string;
  category: string;
  inStockOnly: boolean;
}

export interface SortCriteria {
  key: SortKey | null;
  ascending: boolean;
}

// ===== Filter =====

/** Filter products by search term (case-insensitive name match), category, and stock status. */
export function filterProducts(products: readonly Product[], criteria: FilterCriteria): Product[] {
  const term = criteria.searchTerm.toLowerCase().trim();
  return products.filter((p) => {
    if (term && !p.name.toLowerCase().includes(term)) return false;
    if (criteria.category !== 'All' && p.category !== criteria.category) return false;
    if (criteria.inStockOnly && !p.inStock) return false;
    return true;
  });
}

// ===== Sort =====

/** Sort products by the given key. Returns a new array (never mutates input). */
export function sortProducts(products: readonly Product[], sort: SortCriteria): Product[] {
  if (!sort.key) return [...products];
  const key = sort.key;
  const asc = sort.ascending;
  return [...products].sort((a, b) => {
    let valA: string | number | boolean = a[key];
    let valB: string | number | boolean = b[key];

    if (typeof valA === 'string' && typeof valB === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (typeof valA === 'boolean' && typeof valB === 'boolean') {
      valA = valA ? 1 : 0;
      valB = valB ? 1 : 0;
    }

    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });
}

// ===== Combined =====

/** Filter then sort in one call. */
export function filterAndSortProducts(
  products: readonly Product[],
  filter: FilterCriteria,
  sort: SortCriteria,
): Product[] {
  return sortProducts(filterProducts(products, filter), sort);
}

// ===== Sort toggle =====

/** Toggle sort: same key → flip direction; new key → ascending. */
export function toggleSort(current: SortCriteria, key: SortKey): SortCriteria {
  if (current.key === key) return { key, ascending: !current.ascending };
  return { key, ascending: true };
}

// ===== Toast =====

/** Auto-dismiss duration for toast notifications (ms). */
export const TOAST_DURATION_MS = 3000;

// ===== Cart message =====

/** Canonical "Added Nx ProductName to cart" message. */
export function cartMessage(quantity: number, productName: string): string {
  return `Added ${quantity}x ${productName} to cart`;
}

// ===== Date formatting =====

/** Format a date in en-US long format (e.g. "March 17, 2026"). */
export function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
