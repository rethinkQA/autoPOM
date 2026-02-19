import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('general-store-toast')
export class GeneralStoreToast extends LitElement {
  @property({ type: String }) message = '';
  @property({ type: Boolean }) visible = false;

  static styles = css`
    :host {
      display: block;
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #2c3e50;
      color: #fff;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      transition: opacity 0.3s;
    }
  `;

  render() {
    if (!this.visible) return nothing;

    return html`
      <div class="toast" role="status" aria-live="polite">
        ${this.message}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-toast': GeneralStoreToast;
  }
}
