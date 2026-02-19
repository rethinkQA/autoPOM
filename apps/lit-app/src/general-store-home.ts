import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { PRODUCTS, CATEGORIES, SHIPPING, type Product } from './data.js';
import './general-store-dialog.js';
import './general-store-toast.js';

type SortKey = 'name' | 'price' | 'category' | 'inStock';

@customElement('general-store-home')
export class GeneralStoreHome extends LitElement {
  /* ===== STATE ===== */
  @state() private _searchTerm = '';
  @state() private _category = 'All';
  @state() private _inStockOnly = false;
  @state() private _sortKey: SortKey | null = null;
  @state() private _sortAsc = true;
  @state() private _quantity = 1;
  @state() private _shipping = 'standard';
  @state() private _dateValue = '';
  @state() private _actionOutput = '';
  @state() private _validationMessage = '';
  @state() private _showValidation = false;
  @state() private _dialogProduct: Product | null = null;
  @state() private _toastMessage = '';
  @state() private _showToast = false;
  @state() private _delayedText = 'Loading recommendations…';
  @state() private _delayedLoaded = false;

  private _toastTimer: number | null = null;

  /* ===== STYLES ===== */
  static styles = css`
    :host {
      display: block;
    }

    /* ===== FILTER BAR ===== */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .filter-group label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #555;
    }

    .filter-checkbox {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      align-self: center;
    }

    .filter-checkbox label {
      font-size: 0.85rem;
    }

    input[type="text"],
    select {
      padding: 0.5rem 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.9rem;
      min-width: 180px;
      box-sizing: border-box;
    }

    input[type="text"]:focus,
    select:focus {
      outline: 2px solid #3498db;
      outline-offset: 1px;
      border-color: #3498db;
    }

    /* ===== VALIDATION ===== */
    .validation-message {
      color: #c0392b;
      font-size: 0.85rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: #fdeaea;
      border-radius: 4px;
      border-left: 3px solid #c0392b;
    }

    /* ===== DATA TABLE ===== */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-bottom: 1.5rem;
    }

    .data-table th,
    .data-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }

    .data-table thead th {
      background: #34495e;
      color: #fff;
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      cursor: pointer;
      user-select: none;
    }

    .data-table thead th:last-child {
      cursor: default;
    }

    .data-table thead th:hover:not(:last-child) {
      background: #2c3e50;
    }

    .data-table thead th.sort-asc::after {
      content: ' ▲';
    }

    .data-table thead th.sort-desc::after {
      content: ' ▼';
    }

    .data-table tbody tr:hover {
      background: #f9f9f9;
    }

    .empty-state td {
      text-align: center;
      color: #888;
      padding: 2rem;
      font-style: italic;
    }

    .view-details-btn {
      background: none;
      border: none;
      color: #3498db;
      cursor: pointer;
      font-size: 0.85rem;
      text-decoration: underline;
      padding: 0;
    }

    .view-details-btn:hover {
      color: #2980b9;
    }

    /* ===== ORDER CONTROLS ===== */
    .order-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .control-group {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 1rem;
      background: #fff;
      min-width: 200px;
    }

    .control-group legend {
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0 0.25rem;
    }

    /* ===== STEPPER ===== */
    .stepper {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .stepper button {
      width: 32px;
      height: 32px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #f0f0f0;
      font-size: 1.1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .stepper button:hover:not(:disabled) {
      background: #e0e0e0;
    }

    .stepper button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .stepper input[type="number"] {
      width: 50px;
      text-align: center;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.35rem;
      font-size: 1rem;
      -moz-appearance: textfield;
      box-sizing: border-box;
    }

    .stepper input[type="number"]::-webkit-inner-spin-button,
    .stepper input[type="number"]::-webkit-outer-spin-button {
      -webkit-appearance: none;
    }

    /* ===== RADIO GROUP ===== */
    .radio-group label {
      display: block;
      padding: 0.3rem 0;
      cursor: pointer;
      font-size: 0.9rem;
    }

    .radio-output {
      margin-top: 0.5rem;
      font-weight: 600;
      color: #2c3e50;
      font-size: 0.9rem;
    }

    /* ===== DATE PICKER ===== */
    input[type="date"] {
      padding: 0.5rem 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.9rem;
      margin-top: 0.25rem;
      box-sizing: border-box;
    }

    .date-output {
      margin-top: 0.5rem;
      font-weight: 600;
      color: #2c3e50;
      font-size: 0.9rem;
    }

    /* ===== ACTION AREA ===== */
    .action-area {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .btn-primary {
      background: #27ae60;
      color: #fff;
      border: none;
      padding: 0.6rem 1.5rem;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary:hover {
      background: #219a52;
    }

    .btn-primary:focus {
      outline: 2px solid #27ae60;
      outline-offset: 2px;
    }

    .btn-primary.small {
      font-size: 0.8rem;
      padding: 0.3rem 0.8rem;
    }

    .action-output {
      font-weight: 600;
      color: #27ae60;
      font-size: 0.95rem;
    }

    /* ===== SECTIONS ===== */
    .section {
      margin-bottom: 2rem;
    }

    .section h2 {
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
      color: #2c3e50;
    }

    .item-list {
      list-style: disc;
      padding-left: 1.5rem;
    }

    .item-list li {
      padding: 0.25rem 0;
    }
  `;

  /* ===== LIFECYCLE ===== */
  connectedCallback(): void {
    super.connectedCallback();
    // Delayed content: simulate async load after 1.5s
    setTimeout(() => {
      this._delayedText = 'You might also like: USB-C Hub, Winter Jacket, Cooking Basics';
      this._delayedLoaded = true;
    }, 1500);
  }

  /* ===== FILTERING & SORTING ===== */
  private get _filteredProducts(): Product[] {
    const term = this._searchTerm.toLowerCase().trim();
    let filtered = PRODUCTS.filter((p) => {
      if (term && !p.name.toLowerCase().includes(term)) return false;
      if (this._category !== 'All' && p.category !== this._category) return false;
      if (this._inStockOnly && !p.inStock) return false;
      return true;
    });

    if (this._sortKey) {
      const key = this._sortKey;
      const asc = this._sortAsc;
      filtered = [...filtered].sort((a, b) => {
        let valA: string | number | boolean = a[key];
        let valB: string | number | boolean = b[key];

        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = (valB as string).toLowerCase();
        }
        if (typeof valA === 'boolean') {
          valA = valA ? 1 : 0;
          valB = valB ? 1 : 0;
        }

        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }

  /* ===== EVENT HANDLERS ===== */
  private _onSearch(e: Event): void {
    this._searchTerm = (e.target as HTMLInputElement).value;
  }

  private _onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      if (!this._searchTerm.trim()) {
        this._validationMessage = 'Please enter a search term';
        this._showValidation = true;
      } else {
        this._showValidation = false;
      }
    }
  }

  private _onCategoryChange(e: Event): void {
    this._category = (e.target as HTMLSelectElement).value;
  }

  private _onStockToggle(e: Event): void {
    this._inStockOnly = (e.target as HTMLInputElement).checked;
  }

  private _onSort(key: SortKey): void {
    if (this._sortKey === key) {
      this._sortAsc = !this._sortAsc;
    } else {
      this._sortKey = key;
      this._sortAsc = true;
    }
  }

  private _onSortKeydown(e: KeyboardEvent, key: SortKey): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onSort(key);
    }
  }

  private _sortClass(key: SortKey): string {
    if (this._sortKey !== key) return '';
    return this._sortAsc ? 'sort-asc' : 'sort-desc';
  }

  private _decrement(): void {
    if (this._quantity > 1) this._quantity--;
  }

  private _increment(): void {
    if (this._quantity < 99) this._quantity++;
  }

  private _onShippingChange(e: Event): void {
    this._shipping = (e.target as HTMLInputElement).value;
  }

  private _onDateChange(e: Event): void {
    this._dateValue = (e.target as HTMLInputElement).value;
  }

  private get _formattedDate(): string {
    if (!this._dateValue) return '';
    const date = new Date(this._dateValue + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private _addToCart(product: Product): void {
    const msg = `Added ${this._quantity}x ${product.name} to cart`;
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

  private _openDialog(product: Product): void {
    this._dialogProduct = product;
  }

  private _closeDialog(): void {
    this._dialogProduct = null;
  }

  private _showToastMessage(message: string): void {
    this._toastMessage = message;
    this._showToast = true;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this._showToast = false;
    }, 3000);
  }

  /* ===== RENDER ===== */
  render() {
    const products = this._filteredProducts;
    const shippingCost = SHIPPING[this._shipping].cost;

    return html`
      <!-- Filter Controls -->
      <div class="filter-bar">
        <div class="filter-group">
          <label for="search-input">Search Products</label>
          <input
            type="text"
            id="search-input"
           
            placeholder="Search by name…"
            .value=${this._searchTerm}
            @input=${this._onSearch}
            @keydown=${this._onSearchKeydown}
          >
        </div>

        <div class="filter-group">
          <label for="category-select">Category</label>
          <select
            id="category-select"
           
            .value=${this._category}
            @change=${this._onCategoryChange}
          >
            ${CATEGORIES.map(cat => html`<option value=${cat}>${cat}</option>`)}
          </select>
        </div>

        <div class="filter-group filter-checkbox">
          <input
            type="checkbox"
            id="stock-checkbox"
           
            .checked=${this._inStockOnly}
            @change=${this._onStockToggle}
          >
          <label for="stock-checkbox">Show only in-stock items</label>
        </div>
      </div>

      <!-- Validation Message -->
      ${this._showValidation
        ? html`<div class="validation-message" aria-live="polite">${this._validationMessage}</div>`
        : nothing
      }

      <!-- Product Data Table -->
      <table class="data-table">
        <thead>
          <tr>
            <th
              data-sort-key="name"
              class=${this._sortClass('name')}
              role="button"
              tabindex="0"
              aria-label="Sort by Name"
              @click=${() => this._onSort('name')}
              @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'name')}
            >Name ⇅</th>
            <th
              data-sort-key="price"
              class=${this._sortClass('price')}
              role="button"
              tabindex="0"
              aria-label="Sort by Price"
              @click=${() => this._onSort('price')}
              @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'price')}
            >Price ⇅</th>
            <th
              data-sort-key="category"
              class=${this._sortClass('category')}
              role="button"
              tabindex="0"
              aria-label="Sort by Category"
              @click=${() => this._onSort('category')}
              @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'category')}
            >Category ⇅</th>
            <th
              data-sort-key="inStock"
              class=${this._sortClass('inStock')}
              role="button"
              tabindex="0"
              aria-label="Sort by Stock"
              @click=${() => this._onSort('inStock')}
              @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'inStock')}
            >Stock ⇅</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${products.length === 0
            ? html`
              <tr class="empty-state">
                <td colspan="5">No products found.</td>
              </tr>`
            : products.map(product => html`
              <tr>
                <td>
                  <button
                    class="view-details-btn"
                   
                    @click=${() => this._openDialog(product)}
                  >${product.name}</button>
                </td>
                <td>$${product.price.toFixed(2)}</td>
                <td>${product.category}</td>
                <td>${product.inStock ? 'Yes' : 'No'}</td>
                <td>
                  <button
                    class="btn-primary small"
                    @click=${() => this._addToCart(product)}
                  >Add to Cart</button>
                </td>
              </tr>
            `)
          }
        </tbody>
      </table>

      <!-- Order Controls -->
      <div class="order-controls">
        <!-- Quantity Stepper -->
        <fieldset class="control-group">
          <legend>Quantity</legend>
          <div class="stepper">
            <button
             
              aria-label="Decrease quantity"
              ?disabled=${this._quantity <= 1}
              @click=${this._decrement}
            >−</button>
            <input
              type="number"
             
              id="quantity-input"
              .value=${String(this._quantity)}
              min="1"
              max="99"
              readonly
              aria-label="Quantity"
            >
            <button
             
              aria-label="Increase quantity"
              ?disabled=${this._quantity >= 99}
              @click=${this._increment}
            >+</button>
          </div>
        </fieldset>

        <!-- Shipping Radio Group -->
        <fieldset class="control-group radio-group" @change=${this._onShippingChange}>
          <legend>Shipping Method</legend>
          <label>
            <input type="radio" name="shipping" value="standard" ?checked=${this._shipping === 'standard'}> Standard — <span>$4.99</span>
          </label>
          <label>
            <input type="radio" name="shipping" value="express" ?checked=${this._shipping === 'express'}> Express — <span>$9.99</span>
          </label>
          <label>
            <input type="radio" name="shipping" value="overnight" ?checked=${this._shipping === 'overnight'}> Overnight — <span>$19.99</span>
          </label>
          <div class="radio-output" aria-live="polite">Shipping: $${shippingCost.toFixed(2)}</div>
        </fieldset>

        <!-- Date Picker -->
        <fieldset class="control-group">
          <legend>Delivery Date</legend>
          <label for="delivery-date">Choose a date</label>
          <input
            type="date"
            id="delivery-date"
           
            .value=${this._dateValue}
            @change=${this._onDateChange}
          >
          <div class="date-output" aria-live="polite">${this._formattedDate}</div>
        </fieldset>
      </div>

      <!-- Action Button + Output -->
      <div class="action-area">
        <button
         
          class="btn-primary"
          @click=${this._onActionButtonClick}
        >Add to Cart</button>
        <div class="action-output" aria-live="polite">${this._actionOutput}</div>
      </div>

      <!-- Item List -->
      <div class="section">
        <h2>Popular Items</h2>
        <ul class="item-list">
          <li>Wireless Mouse</li>
          <li>Bluetooth Keyboard</li>
          <li>Running Shoes</li>
        </ul>
      </div>

      <!-- Delayed Content -->
      <div class="section">
        <h2>Recommendations</h2>
        <div aria-live="polite">${this._delayedText}</div>
      </div>

      <!-- Modal Dialog -->
      ${this._dialogProduct
        ? html`
          <general-store-dialog
            .product=${this._dialogProduct}
            @dialog-close=${this._closeDialog}
          ></general-store-dialog>`
        : nothing
      }

      <!-- Toast Notification -->
      <general-store-toast
        .message=${this._toastMessage}
        .visible=${this._showToast}
      ></general-store-toast>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-home': GeneralStoreHome;
  }
}
