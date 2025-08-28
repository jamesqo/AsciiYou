import { defineConfig, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

// Dev-only plugin to save canvas screenshots posted from the client
function debugPlugin(): Plugin {
  return {
    name: 'debug-writer',
    configureServer(server) {
      // Save PNG screenshot (raw blob)
      server.middlewares.use('/debug/save-screenshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          try {
            const outDir = path.resolve(process.cwd(), 'debug', 'screenshots')
            const baseName = `screenshot-${Date.now()}.png`
            fs.mkdirSync(outDir, { recursive: true })
            const outPath = path.join(outDir, baseName)
            fs.writeFileSync(outPath, Buffer.concat(chunks))
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ file: outPath }))
          } catch (e) {
            res.statusCode = 500
            res.end('Failed to save screenshot')
          }
        })
      })

      // Save ASCII mask (plain text)
      server.middlewares.use('/debug/save-ascii', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          try {
            const outDir = path.resolve(process.cwd(), 'debug', 'ascii')
            const baseName = `ascii-${Date.now()}.txt`
            fs.mkdirSync(outDir, { recursive: true })
            const outPath = path.join(outDir, baseName)
            fs.writeFileSync(outPath, Buffer.concat(chunks))
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ file: outPath }))
          } catch (e) {
            res.statusCode = 500
            res.end('Failed to save ASCII mask')
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
  plugins: [debugPlugin()],
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
