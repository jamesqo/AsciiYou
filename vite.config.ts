import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8000,
    open: true
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['@webgpu/types']
  }
})
