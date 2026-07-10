import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where the dev server proxies /api requests. Defaults to a local backend;
// in Docker Compose this is set to http://backend:8000 so the frontend
// container can reach the backend container.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
})
