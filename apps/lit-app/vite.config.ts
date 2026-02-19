import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3007,
  },
  build: {
    target: 'es2021',
  },
});
