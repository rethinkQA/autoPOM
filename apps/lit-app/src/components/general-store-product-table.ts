import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Product } from '@shared/data';
import type { SortKey } from '@shared/logic';

@customElement('general-store-product-table')
export class GeneralStoreProductTable extends LitElement {
  @property({ type: Array }) products: Product[] = [];
  @property({ type: String }) sortKey: SortKey | null = null;
  @property({ type: Boolean }) sortAsc = true;

  /** Render into light DOM — styles come from parent shadow root. */
  protected createRenderRoot() { return this; }

  private _sortClass(key: SortKey): string {
    if (this.sortKey !== key) return '';
    return this.sortAsc ? 'sort-asc' : 'sort-desc';
  }

  private _onSort(key: SortKey): void {
    this.dispatchEvent(new CustomEvent('sort-change', {
      detail: key, bubbles: true, composed: true,
    }));
  }

  private _onSortKeydown(e: KeyboardEvent, key: SortKey): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onSort(key);
    }
  }

  private _onViewDetails(product: Product): void {
    this.dispatchEvent(new CustomEvent('view-details', {
      detail: product, bubbles: true, composed: true,
    }));
  }

  private _onAddToCart(product: Product): void {
    this.dispatchEvent(new CustomEvent('add-to-cart', {
      detail: product, bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <table class="data-table">
        <thead>
          <tr>
            <th data-sort-key="name" class=${this._sortClass('name')} role="button" tabindex="0"
                aria-label="Sort by Name" @click=${() => this._onSort('name')}
                @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'name')}>Name ⇅</th>
            <th data-sort-key="price" class=${this._sortClass('price')} role="button" tabindex="0"
                aria-label="Sort by Price" @click=${() => this._onSort('price')}
                @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'price')}>Price ⇅</th>
            <th data-sort-key="category" class=${this._sortClass('category')} role="button" tabindex="0"
                aria-label="Sort by Category" @click=${() => this._onSort('category')}
                @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'category')}>Category ⇅</th>
            <th data-sort-key="inStock" class=${this._sortClass('inStock')} role="button" tabindex="0"
                aria-label="Sort by Stock" @click=${() => this._onSort('inStock')}
                @keydown=${(e: KeyboardEvent) => this._onSortKeydown(e, 'inStock')}>Stock ⇅</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.products.length === 0
            ? html`<tr class="empty-state"><td colspan="5">No products found.</td></tr>`
            : this.products.map(product => html`
              <tr>
                <td>
                  <button class="view-details-btn"
                    @click=${() => this._onViewDetails(product)}
                  >${product.name}</button>
                </td>
                <td>$${product.price.toFixed(2)}</td>
                <td>${product.category}</td>
                <td>${product.inStock ? 'Yes' : 'No'}</td>
                <td>
                  <button class="btn-primary small"
                    @click=${() => this._onAddToCart(product)}
                  >Add to Cart</button>
                </td>
              </tr>
            `)
          }
        </tbody>
      </table>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-product-table': GeneralStoreProductTable;
  }
}
