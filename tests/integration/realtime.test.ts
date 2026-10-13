import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { io, type Socket } from 'socket.io-client'
import { createGameServer, type GameServer } from '../../server/app.js'
import { campaign } from '../../server/puzzles.js'
import { withConfig } from '../../shared/config.js'
import type { AckResult, GameUpdate } from '../../shared/types.js'

let game: GameServer
let url = ''
const open: Socket[] = []

async function connect(): Promise<Socket> {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false })
  open.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
  return socket
}

function ack<T>(socket: Socket, event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (result: AckResult<T>) => resolve(result))
  })
}

function waitFor(socket: Socket, predicate: (update: GameUpdate) => boolean, timeout = 4000): Promise<GameUpdate> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:update', onUpdate)
      reject(new Error('timed out waiting for a game update'))
    }, timeout)
    const onUpdate = (update: GameUpdate) => {
      if (!predicate(update)) return
      clearTimeout(timer)
      socket.off('game:update', onUpdate)
      resolve(update)
    }
    socket.on('game:update', onUpdate)
  })
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out))
  return out
}

beforeAll(async () => {
  game = createGameServer({
    config: withConfig({
      roundMs: { easy: 120_000, medium: 120_000, hard: 120_000 },
      roomTtlMs: 30 * 60_000,
    }),
    limits: { createsPer10Min: 10_000, joinsPer10Min: 10_000, failedJoinsPer5Min: 10_000, eventsPer10s: 10_000 },
    testHooks: true,
  })
  const port = await game.listen(0)
  url = `http://127.0.0.1:${port}`
})

afterEach(() => {
  for (const socket of open) socket.disconnect()
  open.length = 0
})

afterAll(async () => {
  await game.close()
})

describe('realtime rooms', () => {
  it('syncs two players, hides private clues, scores once, and advances', async () => {
    const ada = await connect()
    const adaUpdate = waitFor(ada, (update) => update.state.players.length === 1)
    const created = await ack<{ code: string; token: string; playerId: string }>(ada, 'room:create', { name: 'Ada' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await adaUpdate

    const bo = await connect()
    const boJoined = waitFor(bo, (update) => update.state.players.length === 2)
    const adaSeesBo = waitFor(ada, (update) => update.state.players.some((player) => player.name === 'Bo'))
    const joined = await ack<{ playerId: string }>(bo, 'room:join', { code: created.data.code, name: 'Bo' })
    expect(joined.ok).toBe(true)
    const boView = await boJoined
    const adaView = await adaSeesBo
    expect(adaView.state.players.map((player) => player.name).sort()).toEqual(['Ada', 'Bo'])
    expect(boView.state.code).toBe(adaView.state.code)

    await ack(ada, 'room:ready', { ready: true })
    const bothReady = waitFor(bo, (update) => update.state.phase === 'READY')
    await ack(bo, 'room:ready', { ready: true })
    await bothReady
    const denied = await ack(bo, 'room:start', {})
    expect(denied).toMatchObject({ ok: false, error: 'NOT_HOST' })

    const startedAda = waitFor(ada, (update) => update.state.phase === 'IN_PROGRESS')
    const startedBo = waitFor(bo, (update) => update.state.phase === 'IN_PROGRESS')
    expect((await ack(ada, 'room:start', {})).ok).toBe(true)
    const liveAda = await startedAda
    const liveBo = await startedBo
    const puzzle = campaign[0]
    const adaClues = liveAda.private.clues.map((clue) => clue.text)
    const boClues = liveBo.private.clues.map((clue) => clue.text)
    expect(adaClues).toEqual(puzzle.bundles[0].map((clue) => clue.text))
    expect(boClues).toEqual(puzzle.bundles[1].map((clue) => clue.text))
    expect(strings(liveAda.state)).not.toContain(puzzle.answer)
    for (const text of boClues) {
      expect(strings(liveAda)).not.toContain(text)
      expect(strings(liveAda.private)).not.toContain(text)
    }
    expect(liveAda.state.deadline).toBe(liveBo.state.deadline)

    const adaHears = waitFor(ada, (update) => update.state.chat.some((message) => message.text === 'South fragment ready'))
    expect((await ack(bo, 'room:chat', { text: 'South fragment ready' })).ok).toBe(true)
    expect((await adaHears).state.chat.some((message) => message.text === 'South fragment ready')).toBe(true)
    const boHears = waitFor(bo, (update) => update.state.chat.some((message) => message.text === 'North fragment ready'))
    expect((await ack(ada, 'room:chat', { text: 'North fragment ready' })).ok).toBe(true)
    await boHears

    expect((await ack(ada, 'room:submit', { answer: '' }))).toMatchObject({ ok: false, error: 'INVALID_ANSWER' })
    const wrongSeen = waitFor(bo, (update) => update.state.attemptsUsed === 1)
    expect((await ack(ada, 'room:submit', { answer: '0000' })).ok).toBe(true)
    await wrongSeen

    const solvedAda = waitFor(ada, (update) => update.state.phase === 'WON')
    const solvedBo = waitFor(bo, (update) => update.state.phase === 'WON')
    const [first, second] = await Promise.all([
      ack<{ correct: boolean }>(ada, 'room:submit', { answer: puzzle.answer }),
      ack<{ correct: boolean }>(bo, 'room:submit', { answer: puzzle.answer }),
    ])
    const successes = [first, second].filter((result) => result.ok && result.data.correct)
    expect(successes).toHaveLength(1)
    const endAda = await solvedAda
    const endBo = await solvedBo
    expect(endAda.state.teamScore).toBe(endBo.state.teamScore)
    expect(endAda.state.teamScore).toBe(endAda.state.reveal?.scoreAwarded)
    expect(endAda.state.reveal?.answer).toBe(puzzle.answer)
    expect(endBo.state.phase).toBe('WON')

    const nextAda = waitFor(ada, (update) => update.state.title === campaign[1].title && update.state.phase === 'IN_PROGRESS')
    const nextBo = waitFor(bo, (update) => update.state.missionNumber === 2)
    expect((await ack(bo, 'room:next', {})).ok).toBe(false)
    expect((await ack(ada, 'room:next', {})).ok).toBe(true)
    const missionTwo = await nextAda
    await nextBo
    expect(missionTwo.private.clues.map((clue) => clue.text)).toEqual(campaign[1].bundles[0].map((clue) => clue.text))
    expect(missionTwo.state.teamScore).toBe(endAda.state.teamScore)
  })

  it('rejects bad rooms, isolates chat, and reconnects after a drop', async () => {
    const ada = await connect()
    const created = await ack<{ code: string; token: string; playerId: string }>(ada, 'room:create', { name: 'Ada' })
    if (!created.ok) throw new Error('create failed')
    expect(await ack(ada, 'room:create', null)).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' })
    const stranger = await connect()
    expect(await ack(stranger, 'room:join', { code: 'ZZZZZ', name: 'Bo' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' })
    expect(await ack(stranger, 'room:join', { code: 'IIIII', name: 'Bo' })).toMatchObject({ ok: false, error: 'INVALID_CODE' })

    const bo = await connect()
    const joined = waitFor(bo, (update) => update.private.playerId.length > 0)
    expect((await ack(bo, 'room:join', { code: created.data.code, name: 'Bo' })).ok).toBe(true)
    await joined
    const otherHost = await connect()
    const other = await ack<{ code: string }>(otherHost, 'room:create', { name: 'Cy' })
    if (!other.ok) throw new Error('second room failed')
    const heard = waitFor(otherHost, (update) => update.state.chat.some((message) => message.text === 'only in here'))
    await ack(otherHost, 'room:chat', { text: 'only in here' })
    await heard
    const adaState = game.store.publicByCode(created.data.code)
    expect(adaState?.chat.some((message) => message.text === 'only in here')).toBe(false)

    await ack(ada, 'room:ready', { ready: true })
    await ack(bo, 'room:ready', { ready: true })
    const playing = waitFor(ada, (update) => update.state.phase === 'IN_PROGRESS')
    await ack(ada, 'room:start', {})
    const beforeDrop = await playing
    const dropped = waitFor(bo, (update) => update.state.players.some((player) => player.name === 'Ada' && !player.connected))
    ada.disconnect()
    await dropped
    expect(game.store.publicByCode(created.data.code)?.phase).toBe('IN_PROGRESS')

    const adaAgain = await connect()
    const restored = waitFor(adaAgain, (update) => update.state.phase === 'IN_PROGRESS' && update.private.playerId === created.data.playerId)
    const resumed = await ack(adaAgain, 'room:resume', { code: created.data.code, token: created.data.token })
    expect(resumed.ok).toBe(true)
    const back = await restored
    expect(back.private.clues).toEqual(beforeDrop.private.clues)

    const gone = waitFor(adaAgain, (update) => !update.state.players.some((player) => player.name === 'Bo'))
    expect((await ack(bo, 'room:leave', {})).ok).toBe(true)
    const afterLeave = await gone
    expect(afterLeave.state.players).toHaveLength(1)
    expect(afterLeave.state.phase).toBe('IN_PROGRESS')
  })

  it('does not leak answers through the rules endpoint and survives a handler error', async () => {
    const response = await fetch(`${url}/api/rules`)
    expect(response.ok).toBe(true)
    const body = await response.text()
    for (const puzzle of campaign) {
      expect(body).not.toContain(puzzle.answer)
      for (const clue of puzzle.bundles.flat()) expect(body).not.toContain(clue.text)
    }
    const socket = await connect()
    expect(await ack(socket, 'test:explode', {})).toMatchObject({ ok: false, error: 'SERVER_ERROR' })
    expect((await fetch(`${url}/api/health`)).ok).toBe(true)
  })
})
