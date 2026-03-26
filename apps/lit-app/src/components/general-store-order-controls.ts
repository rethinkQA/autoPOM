import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Shoelace components
import '@shoelace-style/shoelace/dist/components/radio-group/radio-group.js';
import '@shoelace-style/shoelace/dist/components/radio/radio.js';

@customElement('general-store-order-controls')
export class GeneralStoreOrderControls extends LitElement {
  @property({ type: Number }) quantity = 1;
  @property({ type: String }) shipping = 'standard';
  @property({ type: Number }) shippingCost = 4.99;
  @property({ type: String }) dateValue = '';
  @property({ type: String }) formattedDate = '';

  /** Render into light DOM — styles come from parent shadow root. */
  protected createRenderRoot() { return this; }

  private _decrement(): void {
    this.dispatchEvent(new CustomEvent('quantity-decrement', { bubbles: true, composed: true }));
  }

  private _increment(): void {
    this.dispatchEvent(new CustomEvent('quantity-increment', { bubbles: true, composed: true }));
  }

  private _onShippingChange(e: Event): void {
    this.dispatchEvent(new CustomEvent('shipping-change', {
      detail: (e.target as HTMLInputElement).value, bubbles: true, composed: true,
    }));
  }

  private _onDateChange(e: Event): void {
    this.dispatchEvent(new CustomEvent('date-change', {
      detail: (e.target as HTMLInputElement).value, bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="order-controls">
        <fieldset class="control-group">
          <legend>Quantity</legend>
          <div class="stepper">
            <button aria-label="Decrease quantity" ?disabled=${this.quantity <= 1}
              @click=${this._decrement}>−</button>
            <input type="number" id="quantity-input" .value=${String(this.quantity)}
              min="1" max="99" readonly aria-label="Quantity">
            <button aria-label="Increase quantity" ?disabled=${this.quantity >= 99}
              @click=${this._increment}>+</button>
          </div>
        </fieldset>

        <fieldset class="control-group radio-group">
          <legend>Shipping Method</legend>
          <sl-radio-group value=${this.shipping} @sl-change=${this._onShippingChange}>
            <sl-radio value="standard">Standard — $4.99</sl-radio>
            <sl-radio value="express">Express — $9.99</sl-radio>
            <sl-radio value="overnight">Overnight — $19.99</sl-radio>
          </sl-radio-group>
          <div class="radio-output" aria-live="polite">Shipping: $${this.shippingCost.toFixed(2)}</div>
        </fieldset>

        <fieldset class="control-group">
          <legend>Delivery Date</legend>
          <label for="delivery-date">Choose a date</label>
          <input type="date" id="delivery-date" .value=${this.dateValue}
            @change=${this._onDateChange}>
          <div class="date-output" aria-live="polite">${this.formattedDate}</div>
        </fieldset>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-order-controls': GeneralStoreOrderControls;
  }
}
