import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <h1>GeneralStore <span class="tech-badge">Angular</span></h1>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
           class="nav-link">Home</a>
        <a routerLink="/about" routerLinkActive="active"
           class="nav-link">About</a>
      </nav>
    </header>

    <main>
      <router-outlet />
    </main>

    <footer>
      <p>&copy; 2026 GeneralStore — Angular Test Target</p>
    </footer>
  `,
  styles: [],
})
export class AppComponent {}

