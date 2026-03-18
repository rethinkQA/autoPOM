/**
 * Canonical product data shared across all test-fixture apps.
 *
 * Each app imports from this single source of truth.
 * Changes here propagate to all 7 apps automatically — no manual sync needed.
 *
 * @module
 */

export interface Product {
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

export const PRODUCTS: Product[] = [
  { name: 'Wireless Mouse',      price: 29.99,  category: 'Electronics', inStock: true },
  { name: 'Bluetooth Keyboard',  price: 49.99,  category: 'Electronics', inStock: true },
  { name: 'USB-C Hub',           price: 39.99,  category: 'Electronics', inStock: false },
  { name: 'Running Shoes',       price: 89.99,  category: 'Clothing',    inStock: true },
  { name: 'Winter Jacket',       price: 129.99, category: 'Clothing',    inStock: false },
  { name: 'Cooking Basics',      price: 24.99,  category: 'Books',       inStock: true },
  { name: 'Science Fiction Novel', price: 14.99, category: 'Books',       inStock: true },
];

export const CATEGORIES = ['All', 'Electronics', 'Books', 'Clothing'];

export const SHIPPING: Record<string, { label: string; cost: number }> = {
  standard:  { label: 'Standard',  cost: 4.99 },
  express:   { label: 'Express',   cost: 9.99 },
  overnight: { label: 'Overnight', cost: 19.99 },
};
