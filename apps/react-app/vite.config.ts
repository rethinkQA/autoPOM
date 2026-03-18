import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': resolve(__dirname, '../../shared') },
  },
  server: {
    port: 3002,
    strictPort: true,
    fs: { allow: ['.', '../../shared'] },
  },
})
