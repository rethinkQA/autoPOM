import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, '../../shared') },
  },
  server: {
    port: 3007,
    strictPort: true,
    fs: { allow: ['.', '../../shared'] },
  },
  build: {
    target: 'es2022',
  },
});
