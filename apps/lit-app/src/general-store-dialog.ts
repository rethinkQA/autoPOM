import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Product } from './data.js';

@customElement('general-store-dialog')
export class GeneralStoreDialog extends LitElement {
  @property({ type: Object }) product: Product | null = null;

  static styles = css`
    :host {
      display: block;
    }

    dialog {
      border: none;
      border-radius: 12px;
      padding: 0;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
    }

    .modal-content {
      padding: 2rem;
    }

    .modal-content h2 {
      margin: 0 0 1rem;
      color: #2c3e50;
    }

    .modal-content p {
      margin: 0 0 1.5rem;
      color: #555;
      line-height: 1.6;
    }

    .btn-secondary {
      background: #95a5a6;
      color: #fff;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-secondary:hover {
      background: #7f8c8d;
    }
  `;

  protected firstUpdated(): void {
    this._openDialog();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('product') && this.product) {
      this._openDialog();
    }
  }

  private _openDialog(): void {
    const dialog = this.shadowRoot?.querySelector('dialog');
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  private _close(): void {
    const dialog = this.shadowRoot?.querySelector('dialog');
    if (dialog) dialog.close();
    this.dispatchEvent(new CustomEvent('dialog-close', { bubbles: true, composed: true }));
  }

  private _onBackdropClick(e: MouseEvent): void {
    const dialog = this.shadowRoot?.querySelector('dialog');
    if (e.target === dialog) {
      this._close();
    }
  }

  render() {
    if (!this.product) return html``;

    const p = this.product;
    return html`
      <dialog
       
        @click=${this._onBackdropClick}
      >
        <div class="modal-content">
          <h2>${p.name}</h2>
          <p>${p.name} — $${p.price.toFixed(2)} | Category: ${p.category} | ${p.inStock ? 'In Stock' : 'Out of Stock'}</p>
          <button
           
            class="btn-secondary"
            aria-label="Close dialog"
            @click=${this._close}
          >Close</button>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-dialog': GeneralStoreDialog;
  }
}
