import { defineConfig, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import assert from 'assert'

// Dev-only plugin to save canvas screenshots posted from the client
function debugPlugin(): Plugin {
  return {
    name: 'debug-writer',
    configureServer(server) {
      server.middlewares.use('/saveDebugInfo', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          try {
            const saveType = (req.headers['x-save-type'] as string | undefined)?.toLowerCase()

            let outDir: string,
                baseName: string,
                fileContents: string | Buffer

            if (saveType === 'screenshot') {
              // Raw binary PNG blob expected
              outDir = path.resolve(process.cwd(), 'debug', 'screenshots')
              baseName = `screenshot-${Date.now()}`
              fileContents = Buffer.concat(chunks)
            } else if (saveType === 'ascii') {
              // Plain UTF-8 text body
              outDir = path.resolve(process.cwd(), 'debug', 'ascii')
              baseName = `ascii-${Date.now()}.txt`
              fileContents = Buffer.concat(chunks).toString('utf8')
            } else {
              throw new Error(`Invalid save type: ${saveType}`)
            }

            fs.mkdirSync(outDir, { recursive: true })
            const outPath = path.join(outDir, baseName)
            fs.writeFileSync(outPath, fileContents)

            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ file: outPath }))
          } catch (e) {
            res.statusCode = 500
            res.end('Failed to save')
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
