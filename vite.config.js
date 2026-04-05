import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Serve static files (like images) from the "images" folder
  // next to this vite.config.js. They are then available at "/<filename>".
  publicDir: 'images',
})
