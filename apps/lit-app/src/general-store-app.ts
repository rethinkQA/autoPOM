import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './general-store-home.js';
import './general-store-about.js';

/**
 * App shell component — renders into LIGHT DOM so that structural
 * semantic HTML elements (app-header, nav-home, nav-about, main-content,
 * app-footer) are accessible without shadow DOM piercing (§6.5).
 *
 * Interactive elements live inside child components' shadow roots,
 * requiring piercing — that's the whole point of the Lit app.
 */
@customElement('general-store-app')
export class GeneralStoreApp extends LitElement {
  @state() private _page: 'home' | 'about' = 'home';

  /** Render into light DOM — no shadow root for the app shell. */
  protected createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._handleHashChange = this._handleHashChange.bind(this);
    window.addEventListener('hashchange', this._handleHashChange);
    this._handleHashChange();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this._handleHashChange);
  }

  private _handleHashChange(): void {
    const hash = window.location.hash;
    this._page = hash === '#about' ? 'about' : 'home';
  }

  private _navigate(page: 'home' | 'about'): void {
    window.location.hash = `#${page}`;
  }

  render() {
    return html`
      <header>
        <h1>GeneralStore <span class="tech-badge">Lit</span></h1>
        <nav>
          <a
            class="nav-link ${this._page === 'home' ? 'active' : ''}"
           
            href="#home"
            @click=${(e: Event) => { e.preventDefault(); this._navigate('home'); }}
          >Home</a>
          <a
            class="nav-link ${this._page === 'about' ? 'active' : ''}"
           
            href="#about"
            @click=${(e: Event) => { e.preventDefault(); this._navigate('about'); }}
          >About</a>
        </nav>
      </header>

      <main>
        ${this._page === 'home'
          ? html`<general-store-home></general-store-home>`
          : html`<general-store-about></general-store-about>`
        }
      </main>

      <footer>
        <p>&copy; 2026 GeneralStore — Lit Web Components Test Target</p>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'general-store-app': GeneralStoreApp;
  }
}
