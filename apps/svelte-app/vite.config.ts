import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { '@shared': resolve(__dirname, '../../shared') },
  },
  server: {
    port: 3005,
    strictPort: true,
    fs: { allow: ['.', '../../shared'] },
  },
});
