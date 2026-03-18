import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

/**
 * About page — renders into light DOM because about-text is a
 * structural element that must be accessible without shadow
 * DOM piercing (§6.5).
 */
@customElement('general-store-about')
export class GeneralStoreAbout extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <p class="about-text">
        Welcome to <strong>GeneralStore</strong> — your one-stop shop for everyday essentials.
        We carry electronics, clothing, and books at unbeatable prices. This store is a demo
        application built with Lit web components, showcasing Shadow DOM and custom element APIs.
      </p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-about': GeneralStoreAbout;
  }
}
