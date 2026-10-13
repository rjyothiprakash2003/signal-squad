import path from 'node:path'
import { createGameServer } from './app.js'
import { loadConfig, loadEnvFile } from './env.js'

loadEnvFile(path.resolve(process.cwd(), '.env'))

const config = loadConfig()
const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer from 1 to 65535.')
  process.exit(1)
}

const staticDir = process.env.NODE_ENV === 'production'
  ? path.resolve(process.cwd(), 'dist/client')
  : undefined

const game = createGameServer({ config, staticDir })

game.listen(port, host).then((actual) => {
  console.log(JSON.stringify({ event: 'listen', url: `http://localhost:${actual}` }))
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'listen failed'
  console.error(JSON.stringify({ event: 'listen_error', message }))
  process.exit(1)
})
