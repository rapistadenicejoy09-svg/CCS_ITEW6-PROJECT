import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // `npm run dev` injects VITE_API_BASE into the Vite process env; .env files may also set it.
  const apiProxyTarget = process.env.VITE_API_BASE || env.VITE_API_BASE || 'http://127.0.0.1:5000'

  return {
    plugins: [tailwindcss(), react()],
    // Serve static files (like images) from the "images" folder
    // next to this vite.config.js. They are then available at "/<filename>".
    publicDir: 'images',
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
