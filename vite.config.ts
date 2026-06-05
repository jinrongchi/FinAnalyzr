import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
  server: {
    proxy: {
      '/api/tushare': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
