import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product, type ShippingKey } from '@shared/data';
import {
  filterAndSortProducts, toggleSort, cartMessage,
  TOAST_DURATION_MS, type SortKey,
} from '@shared/logic';
import '../components/general-store-filter-bar.js';
import '../components/general-store-product-table.js';
import '../components/general-store-order-controls.js';
import '../components/general-store-dialog.js';
import '../components/general-store-toast.js';

// Shoelace base path (needed once per app)
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
setBasePath('/node_modules/@shoelace-style/shoelace/dist');

@customElement('general-store-home')
export class GeneralStoreHome extends LitElement {
  /* ===== STATE ===== */
  @state() private _searchTerm = '';
  @state() private _category = 'All';
  @state() private _inStockOnly = false;
  @state() private _sortKey: SortKey | null = null;
  @state() private _sortAsc = true;
  @state() private _quantity = 1;
  @state() private _shipping: ShippingKey = 'standard';
  @state() private _dateValue = '';
  @state() private _actionOutput = '';
  @state() private _validationMessage = '';
  @state() private _showValidation = false;
  @state() private _dialogProduct: Product | null = null;
  @state() private _toastMessage = '';
  @state() private _showToast = false;
  @state() private _delayedText = 'Loading recommendations\u2026';
  @state() private _delayedLoaded = false;

  private _toastTimer: number | null = null;

  static styles = css`
    :host { display: block; }

    /* ===== FILTER BAR ===== */
    .filter-bar {
      display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end;
      margin-bottom: 1.5rem; padding: 1rem; background: #fff;
      border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .filter-group label { font-size: 0.8rem; font-weight: 600; color: #555; }
    .filter-checkbox {
      flex-direction: row; align-items: center; gap: 0.5rem; align-self: center;
    }
    .filter-checkbox label { font-size: 0.85rem; }
    input[type="text"], select {
      padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 4px;
      font-size: 0.9rem; min-width: 180px; box-sizing: border-box;
    }
    input[type="text"]:focus, select:focus {
      outline: 2px solid #3498db; outline-offset: 1px; border-color: #3498db;
    }

    /* ===== VALIDATION ===== */
    .validation-message {
      color: #c0392b; font-size: 0.85rem; margin-bottom: 1rem;
      padding: 0.5rem 0.75rem; background: #fdeaea; border-radius: 4px;
      border-left: 3px solid #c0392b;
    }

    /* ===== DATA TABLE ===== */
    .data-table {
      width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px;
      overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem;
    }
    .data-table th, .data-table td {
      padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee;
    }
    .data-table thead th {
      background: #34495e; color: #fff; font-weight: 600; font-size: 0.85rem;
      text-transform: uppercase; letter-spacing: 0.03em; cursor: pointer; user-select: none;
    }
    .data-table thead th:last-child { cursor: default; }
    .data-table thead th:hover:not(:last-child) { background: #2c3e50; }
    .data-table thead th.sort-asc::after { content: ' \u25b2'; }
    .data-table thead th.sort-desc::after { content: ' \u25bc'; }
    .data-table tbody tr:hover { background: #f9f9f9; }
    .empty-state td { text-align: center; color: #888; padding: 2rem; font-style: italic; }
    .view-details-btn {
      background: none; border: none; color: #3498db; cursor: pointer;
      font-size: 0.85rem; text-decoration: underline; padding: 0;
    }
    .view-details-btn:hover { color: #2980b9; }

    /* ===== ORDER CONTROLS ===== */
    .order-controls { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem; }
    .control-group {
      border: 1px solid #ddd; border-radius: 8px; padding: 1rem;
      background: #fff; min-width: 200px;
    }
    .control-group legend { font-weight: 600; font-size: 0.9rem; padding: 0 0.25rem; }
    .stepper { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
    .stepper button {
      width: 32px; height: 32px; border: 1px solid #ccc; border-radius: 4px;
      background: #f0f0f0; font-size: 1.1rem; cursor: pointer;
      display: flex; align-items: center; justify-content: center; transition: background 0.15s;
    }
    .stepper button:hover:not(:disabled) { background: #e0e0e0; }
    .stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
    .stepper input[type="number"] {
      width: 50px; text-align: center; border: 1px solid #ccc; border-radius: 4px;
      padding: 0.35rem; font-size: 1rem; -moz-appearance: textfield; box-sizing: border-box;
    }
    .stepper input[type="number"]::-webkit-inner-spin-button,
    .stepper input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
    .radio-group label { display: block; padding: 0.3rem 0; cursor: pointer; font-size: 0.9rem; }
    .radio-output { margin-top: 0.5rem; font-weight: 600; color: #2c3e50; font-size: 0.9rem; }
    input[type="date"] {
      padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 4px;
      font-size: 0.9rem; margin-top: 0.25rem; box-sizing: border-box;
    }
    .date-output { margin-top: 0.5rem; font-weight: 600; color: #2c3e50; font-size: 0.9rem; }

    /* ===== ACTION AREA ===== */
    .action-area { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
    .btn-primary {
      background: #27ae60; color: #fff; border: none; padding: 0.6rem 1.5rem;
      border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary:hover { background: #219a52; }
    .btn-primary:focus { outline: 2px solid #27ae60; outline-offset: 2px; }
    .btn-primary.small { font-size: 0.8rem; padding: 0.3rem 0.8rem; }
    .action-output { font-weight: 600; color: #27ae60; font-size: 0.95rem; }

    /* ===== SECTIONS ===== */
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: #2c3e50; }
    .item-list { list-style: disc; padding-left: 1.5rem; }
    .item-list li { padding: 0.25rem 0; }
  `;

  /* ===== LIFECYCLE ===== */
  connectedCallback(): void {
    super.connectedCallback();
    setTimeout(() => {
      this._delayedText = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
      this._delayedLoaded = true;
    }, 1500);
  }

  /* ===== COMPUTED ===== */
  private get _filteredProducts(): Product[] {
    return filterAndSortProducts(
      PRODUCTS,
      { searchTerm: this._searchTerm, category: this._category, inStockOnly: this._inStockOnly },
      { key: this._sortKey, ascending: this._sortAsc },
    );
  }

  private get _formattedDate(): string {
    if (!this._dateValue) return '';
    const date = new Date(this._dateValue + 'T00:00:00');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /* ===== EVENT HANDLERS ===== */
  private _onSearchInput(e: CustomEvent): void { this._searchTerm = e.detail; }
  private _onSearchSubmit(e: CustomEvent): void {
    if (!(e.detail as string).trim()) {
      this._validationMessage = 'Please enter a search term';
      this._showValidation = true;
    } else {
      this._showValidation = false;
    }
  }
  private _onCategoryChange(e: CustomEvent): void { this._category = e.detail; }
  private _onStockToggle(e: CustomEvent): void { this._inStockOnly = e.detail; }

  private _onSortChange(e: CustomEvent): void {
    const next = toggleSort({ key: this._sortKey, ascending: this._sortAsc }, e.detail as SortKey);
    this._sortKey = next.key;
    this._sortAsc = next.ascending;
  }

  private _onViewDetails(e: CustomEvent): void { this._dialogProduct = e.detail as Product; }
  private _onAddToCart(e: CustomEvent): void { this._addToCart(e.detail as Product); }

  private _onQuantityDecrement(): void { if (this._quantity > 1) this._quantity--; }
  private _onQuantityIncrement(): void { if (this._quantity < 99) this._quantity++; }
  private _onShippingChange(e: CustomEvent): void { this._shipping = e.detail; }
  private _onDateChange(e: CustomEvent): void { this._dateValue = e.detail; }

  private _addToCart(product: Product): void {
    const msg = cartMessage(this._quantity, product.name);
    this._actionOutput = msg;
    this._showToastMessage(msg);
  }

  private _onActionButtonClick(): void {
    const products = this._filteredProducts;
    if (products.length === 0) {
      this._validationMessage = 'Please enter a search term';
      this._showValidation = true;
      return;
    }
    this._showValidation = false;
    this._addToCart(products[0]);
  }

  private _closeDialog(): void { this._dialogProduct = null; }

  private _showToastMessage(message: string): void {
    this._toastMessage = message;
    this._showToast = true;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => { this._showToast = false; }, TOAST_DURATION_MS);
  }

  /* ===== RENDER ===== */
  render() {
    const products = this._filteredProducts;
    const shippingCost = SHIPPING[this._shipping].cost;

    return html`
      <general-store-filter-bar
        .searchTerm=${this._searchTerm}
        .category=${this._category}
        .inStockOnly=${this._inStockOnly}
        .categories=${CATEGORIES}
        @search-input=${this._onSearchInput}
        @search-submit=${this._onSearchSubmit}
        @category-change=${this._onCategoryChange}
        @stock-toggle=${this._onStockToggle}
      ></general-store-filter-bar>

      ${this._showValidation
        ? html`<div class="validation-message" aria-live="polite">${this._validationMessage}</div>`
        : nothing}

      <general-store-product-table
        .products=${products}
        .sortKey=${this._sortKey}
        .sortAsc=${this._sortAsc}
        @sort-change=${this._onSortChange}
        @view-details=${this._onViewDetails}
        @add-to-cart=${this._onAddToCart}
      ></general-store-product-table>

      <general-store-order-controls
        .quantity=${this._quantity}
        .shipping=${this._shipping}
        .shippingCost=${shippingCost}
        .dateValue=${this._dateValue}
        .formattedDate=${this._formattedDate}
        @quantity-decrement=${this._onQuantityDecrement}
        @quantity-increment=${this._onQuantityIncrement}
        @shipping-change=${this._onShippingChange}
        @date-change=${this._onDateChange}
      ></general-store-order-controls>

      <div class="action-area">
        <button class="btn-primary" @click=${this._onActionButtonClick}>Add to Cart</button>
        <div class="action-output" aria-live="polite">${this._actionOutput}</div>
      </div>

      <div class="section">
        <h2>Popular Items</h2>
        <ul class="item-list">
          <li>Wireless Mouse</li>
          <li>Bluetooth Keyboard</li>
          <li>Running Shoes</li>
        </ul>
      </div>

      <div class="section">
        <h2>Recommendations</h2>
        <div aria-live="polite">${this._delayedText}</div>
      </div>

      ${this._dialogProduct
        ? html`<general-store-dialog .product=${this._dialogProduct}
            @dialog-close=${this._closeDialog}></general-store-dialog>`
        : nothing}

      <general-store-toast .message=${this._toastMessage} .visible=${this._showToast}></general-store-toast>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-home': GeneralStoreHome;
  }
}
