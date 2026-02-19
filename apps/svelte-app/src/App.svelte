<script lang="ts">
  import Home from './pages/Home.svelte';
  import About from './pages/About.svelte';
  import { toastStore } from './lib/toast.svelte';

  let currentPage = $state(window.location.hash === '#/about' ? 'about' : 'home');

  $effect(() => {
    function handleHashChange() {
      currentPage = window.location.hash === '#/about' ? 'about' : 'home';
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

<header>
  <h1>GeneralStore <span class="tech-badge">Svelte</span></h1>
  <nav>
    <a href="#/" class="nav-link" class:active={currentPage === 'home'}>Home</a>
    <a href="#/about" class="nav-link" class:active={currentPage === 'about'}>About</a>
  </nav>
</header>

<main>
  {#if currentPage === 'about'}
    <About />
  {:else}
    <Home />
  {/if}
</main>

<footer>
  <p>&copy; 2026 GeneralStore — Svelte Test Target</p>
</footer>

{#if toastStore.visible}
  <div class="toast" role="status" aria-live="polite">
    {toastStore.message}
  </div>
{/if}
