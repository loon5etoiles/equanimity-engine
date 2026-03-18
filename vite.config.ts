import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In local dev, API calls return 404 gracefully instead of crashing
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // If no local API server is running, requests will fail gracefully
      },
    },
  },
})
