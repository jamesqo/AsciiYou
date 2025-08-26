import { defineConfig, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

// Dev-only plugin to save canvas screenshots posted from the client
function screenshotPlugin(): Plugin {
  return {
    name: 'screenshot-writer',
    configureServer(server) {
      server.middlewares.use('/__screenshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks)
            const outDir = path.resolve(process.cwd(), 'debug', 'screenshots')
            fs.mkdirSync(outDir, { recursive: true })
            const filename = `screenshot-${Date.now()}.png`
            const outPath = path.join(outDir, filename)
            fs.writeFileSync(outPath, buffer)
            res.statusCode = 200
            res.end(filename)
          } catch (e) {
            res.statusCode = 500
            res.end('Failed to write screenshot')
          }
        })
      })
    },
  }
}

export default defineConfig({
  server: {
    port: 8000,
    open: true,
  },
  plugins: [screenshotPlugin()],
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
