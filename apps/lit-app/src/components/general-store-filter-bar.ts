import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Shoelace components
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';

@customElement('general-store-filter-bar')
export class GeneralStoreFilterBar extends LitElement {
  @property({ type: String }) searchTerm = '';
  @property({ type: String }) category = 'All';
  @property({ type: Boolean }) inStockOnly = false;
  @property({ type: Array }) categories: string[] = [];

  /** Render into light DOM — styles come from parent shadow root. */
  protected createRenderRoot() { return this; }

  private _onSearch(e: Event): void {
    this.dispatchEvent(new CustomEvent('search-input', {
      detail: (e.target as HTMLInputElement).value, bubbles: true, composed: true,
    }));
  }

  private _onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      this.dispatchEvent(new CustomEvent('search-submit', {
        detail: this.searchTerm, bubbles: true, composed: true,
      }));
    }
  }

  private _onCategoryChange(e: Event): void {
    this.dispatchEvent(new CustomEvent('category-change', {
      detail: (e.target as any).value, bubbles: true, composed: true,
    }));
  }

  private _onStockToggle(e: Event): void {
    this.dispatchEvent(new CustomEvent('stock-toggle', {
      detail: (e.target as any).checked, bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="filter-bar">
        <div class="filter-group">
          <label for="search-input">Search Products</label>
          <input
            type="text"
            id="search-input"
            placeholder="Search by name…"
            .value=${this.searchTerm}
            @input=${this._onSearch}
            @keydown=${this._onSearchKeydown}
          >
        </div>

        <div class="filter-group">
          <sl-select
            label="Category"
            .value=${this.category}
            @sl-change=${this._onCategoryChange}
          >
            ${this.categories.map(cat => html`<sl-option value=${cat}>${cat}</sl-option>`)}
          </sl-select>
        </div>

        <div class="filter-group filter-checkbox">
          <sl-checkbox
            ?checked=${this.inStockOnly}
            @sl-change=${this._onStockToggle}
          >Show only in-stock items</sl-checkbox>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-filter-bar': GeneralStoreFilterBar;
  }
}
