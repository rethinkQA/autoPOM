import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  template: `
    <p class="about-text">
      Welcome to <strong>GeneralStore</strong> — your one-stop shop for everyday essentials.
      We carry electronics, clothing, and books at unbeatable prices. This store is a demo
      application built with Angular and TypeScript.
    </p>
  `,
  styles: [`
    p {
      font-size: 1rem;
      line-height: 1.8;
      max-width: 600px;
    }
  `],
})
export class AboutComponent {}
