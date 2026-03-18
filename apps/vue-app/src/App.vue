<template>
  <v-app>
    <header>
      <h1>GeneralStore <span class="tech-badge">Vue</span></h1>
      <nav>
        <RouterLink to="/" class="nav-link" active-class="active" :exact="true">Home</RouterLink>
        <RouterLink to="/about" class="nav-link" active-class="active">About</RouterLink>
      </nav>
    </header>

    <main>
      <RouterView />
    </main>

    <footer>
      <p>&copy; 2026 GeneralStore — Vue Test Target</p>
    </footer>
  </v-app>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>
