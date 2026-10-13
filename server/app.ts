import express from 'express'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { Server as IoServer, type Socket } from 'socket.io'
import { campaign } from './puzzles.js'
import { RateLimiter } from './rateLimit.js'
import { RoomStore } from './engine.js'
import { rulesView, type GameConfig } from '../shared/config.js'

export interface Limits {
  createsPer10Min: number
  joinsPer10Min: number
  failedJoinsPer5Min: number
  eventsPer10s: number
}

const DEFAULT_LIMITS: Limits = {
  createsPer10Min: 30,
  joinsPer10Min: 60,
  failedJoinsPer5Min: 100,
  eventsPer10s: 40,
}

export interface GameServerOptions {
  config: GameConfig
  limits?: Partial<Limits>
  staticDir?: string
  testHooks?: boolean
  now?: () => number
}

export interface GameServer {
  app: express.Express
  httpServer: Server
  io: IoServer
  store: RoomStore
  listen: (port: number, host?: string) => Promise<number>
  close: () => Promise<void>
}

interface Binding {
  code: string
  playerId: string
}

export function createGameServer(options: GameServerOptions): GameServer {
  const store = new RoomStore({ config: options.config, now: options.now })
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'none'",
      )
    }
    next()
  })

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'signal-squad', rooms: store.roomCount() })
  })

  app.get('/api/rules', (_req, res) => {
    res.json({
      ...rulesView(options.config, campaign.length),
      campaign: campaign.map((puzzle, index) => ({
        number: index + 1,
        title: puzzle.title,
        difficulty: puzzle.difficulty,
      })),
    })
  })

  if (options.staticDir) {
    const indexHtml = path.join(options.staticDir, 'index.html')
    app.use(express.static(options.staticDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
      },
    }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(indexHtml, (error) => {
        if (error) next()
      })
    })
  }

  const httpServer = createServer(app)
  const io = new IoServer(httpServer, {
    cors: { origin: true },
    maxHttpBufferSize: 20_000,
    connectTimeout: 10_000,
  })

  const createLimiter = new RateLimiter(limits.createsPer10Min, 10 * 60_000, options.now)
  const joinLimiter = new RateLimiter(limits.joinsPer10Min, 10 * 60_000, options.now)
  const failJoinLimiter = new RateLimiter(limits.failedJoinsPer5Min, 5 * 60_000, options.now)
  const eventLimiter = new RateLimiter(limits.eventsPer10s, 10_000, options.now)
  const bindings = new Map<string, Binding>()

  function clientIp(socket: Socket): string {
    if (process.env.TRUST_PROXY === '1') {
      const forwarded = socket.handshake.headers['x-forwarded-for']
      if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim()
    }
    return socket.handshake.address || 'unknown'
  }

  function broadcast(code: string): void {
    const room = store.publicByCode(code)
    if (!room) return
    for (const player of room.players) {
      const binding = [...bindings.entries()].find(([, value]) => value.code === code && value.playerId === player.id)
      if (!binding) continue
      const socket = io.sockets.sockets.get(binding[0])
      const snap = store.snapshot(code, player.id)
      if (socket && snap) socket.emit('game:update', snap)
    }
  }

  function expire(code: string): void {
    const sockets = store.socketIds(code)
    store.deleteRoom(code)
    for (const socketId of sockets) {
      bindings.delete(socketId)
      io.sockets.sockets.get(socketId)?.emit('room:expired', {
        message: 'This room has expired. Create or join a new one.',
      })
    }
  }

  const timer = setInterval(() => {
    const { updated, expired } = store.tick()
    for (const code of updated) broadcast(code)
    for (const code of expired) expire(code)
  }, 400)
  timer.unref?.()

  function reply(cb: unknown, payload: unknown): void {
    if (typeof cb === 'function') cb(payload)
  }

  function on(socket: Socket, event: string, handler: (payload: unknown, cb: unknown) => void): void {
    socket.on(event, (payload: unknown, cb: unknown) => {
      try {
        if (!eventLimiter.allow(socket.id)) {
          reply(cb, { ok: false, error: 'RATE_LIMIT', message: 'Too many requests. Wait a moment.' })
          return
        }
        handler(payload, cb)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        console.error(JSON.stringify({ event: 'server_error', message }))
        reply(cb, { ok: false, error: 'SERVER_ERROR', message: 'Mission control hit a problem. Try again.' })
      }
    })
  }

  function record(socket: Socket, code: string, playerId: string): void {
    const previous = bindings.get(socket.id)
    if (previous && (previous.code !== code || previous.playerId !== playerId)) {
      const left = store.leave(previous.code, previous.playerId)
      if (left.ok && !left.data.deleted) broadcast(previous.code)
    }
    bindings.set(socket.id, { code, playerId })
    store.bind(code, playerId, socket.id)
  }

  io.on('connection', (socket) => {
    on(socket, 'room:create', (payload, cb) => {
      if (!isRecord(payload)) return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Missing room details.' })
      if (!createLimiter.allow(clientIp(socket))) {
        return reply(cb, { ok: false, error: 'RATE_LIMIT', message: 'Too many rooms created from this network. Wait a few minutes.' })
      }
      const result = store.create(payload.name)
      if (!result.ok) return reply(cb, result)
      record(socket, result.code, result.data.playerId)
      reply(cb, result)
      broadcast(result.code)
    })

    on(socket, 'room:join', (payload, cb) => {
      if (!isRecord(payload)) return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Missing room details.' })
      const ip = clientIp(socket)
      if (failJoinLimiter.blocked(ip)) {
        return reply(cb, { ok: false, error: 'RATE_LIMIT', message: 'Too many failed join attempts. Wait a few minutes.' })
      }
      if (!joinLimiter.allow(ip)) {
        return reply(cb, { ok: false, error: 'RATE_LIMIT', message: 'Too many join attempts. Wait a few minutes.' })
      }
      const result = store.join(payload.code, payload.name)
      if (!result.ok) {
        failJoinLimiter.allow(ip)
        return reply(cb, result)
      }
      record(socket, result.code, result.data.playerId)
      reply(cb, result)
      broadcast(result.code)
    })

    on(socket, 'room:resume', (payload, cb) => {
      if (!isRecord(payload)) return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Missing session details.' })
      const result = store.resume(payload.code, payload.token, socket.id)
      if (!result.ok) return reply(cb, result)
      record(socket, result.code, result.data.playerId)
      reply(cb, result)
      broadcast(result.code)
    })

    on(socket, 'room:ready', (payload, cb) => {
      const binding = bindings.get(socket.id)
      if (!binding) return reply(cb, { ok: false, error: 'NOT_IN_ROOM', message: 'Join a room first.' })
      if (!isRecord(payload) || typeof payload.ready !== 'boolean') {
        return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Ready must be true or false.' })
      }
      const result = store.setReady(binding.code, binding.playerId, payload.ready)
      reply(cb, result)
      if (result.ok) broadcast(binding.code)
    })

    const hostAction = (event: 'room:start' | 'room:next' | 'room:replay' | 'room:reset', run: (code: string, playerId: string) => ReturnType<RoomStore['start']>) => {
      on(socket, event, (_payload, cb) => {
        const binding = bindings.get(socket.id)
        if (!binding) return reply(cb, { ok: false, error: 'NOT_IN_ROOM', message: 'Join a room first.' })
        const result = run(binding.code, binding.playerId)
        reply(cb, result)
        if (result.ok || result.changed) broadcast(binding.code)
      })
    }
    hostAction('room:start', (code, playerId) => store.start(code, playerId))
    hostAction('room:next', (code, playerId) => store.next(code, playerId))
    hostAction('room:replay', (code, playerId) => store.replay(code, playerId))
    hostAction('room:reset', (code, playerId) => store.reset(code, playerId))

    on(socket, 'room:submit', (payload, cb) => {
      const binding = bindings.get(socket.id)
      if (!binding) return reply(cb, { ok: false, error: 'NOT_IN_ROOM', message: 'Join a room first.' })
      if (!isRecord(payload)) return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Missing code.' })
      const result = store.submit(binding.code, binding.playerId, payload.answer)
      reply(cb, result)
      if (result.ok || result.changed) broadcast(binding.code)
    })

    on(socket, 'room:chat', (payload, cb) => {
      const binding = bindings.get(socket.id)
      if (!binding) return reply(cb, { ok: false, error: 'NOT_IN_ROOM', message: 'Join a room first.' })
      if (!isRecord(payload)) return reply(cb, { ok: false, error: 'INVALID_PAYLOAD', message: 'Missing message.' })
      const result = store.chat(binding.code, binding.playerId, payload.text)
      reply(cb, result)
      if (result.ok) broadcast(binding.code)
    })

    on(socket, 'room:leave', (_payload, cb) => {
      const binding = bindings.get(socket.id)
      if (!binding) return reply(cb, { ok: false, error: 'NOT_IN_ROOM', message: 'You are not in a room.' })
      bindings.delete(socket.id)
      const result = store.leave(binding.code, binding.playerId)
      reply(cb, result)
      if (result.ok && !result.data.deleted) broadcast(binding.code)
    })

    if (options.testHooks) {
      on(socket, 'test:explode', () => {
        throw new Error('boom')
      })
    }

    socket.on('disconnect', () => {
      const binding = bindings.get(socket.id)
      if (!binding) return
      bindings.delete(socket.id)
      const changed = store.markDisconnected(binding.code, binding.playerId, socket.id)
      if (changed) broadcast(binding.code)
    })
  })

  return {
    app,
    httpServer,
    io,
    store,
    listen(port: number, host = '127.0.0.1') {
      return new Promise((resolve) => {
        httpServer.listen(port, host, () => {
          const address = httpServer.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        })
      })
    },
    async close() {
      clearInterval(timer)
      io.disconnectSockets(true)
      await new Promise<void>((resolve) => io.close(() => resolve()))
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()))
        })
      }
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
