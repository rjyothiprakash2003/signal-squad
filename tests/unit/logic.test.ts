import { describe, expect, it } from 'vitest'
import { assignClues } from '../../server/assign.js'
import { generateRoomCode, ROOM_ALPHABET } from '../../server/codes.js'
import { RoomStore } from '../../server/engine.js'
import { loadConfig } from '../../server/env.js'
import { campaign, solutionsFor } from '../../server/puzzles.js'
import { RateLimiter } from '../../server/rateLimit.js'
import { withConfig, type GameConfig } from '../../shared/config.js'
import { scoreMission } from '../../shared/scoring.js'
import { parseAnswer, parseChat, parseCode, parseName } from '../../shared/validate.js'

function collect(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collect(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collect(item, out))
  return out
}

function harness(overrides: Partial<GameConfig> = {}) {
  let now = 1_000_000
  const { roundMs, ...rest } = overrides
  const store = new RoomStore({
    config: withConfig({
      penaltyMs: 15_000,
      hostGraceMs: 1_000,
      disconnectRemoveMs: 5_000,
      emptyRoomMs: 8_000,
      roomTtlMs: 60_000,
      ...rest,
      roundMs: { easy: 60_000, medium: 60_000, hard: 60_000, ...roundMs },
    }),
    now: () => now,
  })
  return { store, setNow: (value: number) => { now = value } }
}

function boot(overrides?: Partial<GameConfig>) {
  const env = harness(overrides)
  const host = env.store.create('Ada')
  if (!host.ok) throw new Error(host.message)
  const guest = env.store.join(host.data.code, 'Bo')
  if (!guest.ok) throw new Error(guest.message)
  const code = host.data.code
  env.store.bind(code, host.data.playerId, 'ada')
  env.store.bind(code, guest.data.playerId, 'bo')
  return { ...env, host: host.data, guest: guest.data, code }
}

function readyAndStart(env: ReturnType<typeof boot>) {
  expect(env.store.setReady(env.code, env.host.playerId, true).ok).toBe(true)
  expect(env.store.setReady(env.code, env.guest.playerId, true).ok).toBe(true)
  const started = env.store.start(env.code, env.host.playerId)
  expect(started.ok).toBe(true)
}

describe('room codes and validation', () => {
  it('builds unbiased codes from the unambiguous alphabet', () => {
    const code = generateRoomCode(Uint8Array.from([0, 31, 32, 255, 5]))
    expect(code).toBe(`${ROOM_ALPHABET[0]}${ROOM_ALPHABET[31]}${ROOM_ALPHABET[0]}${ROOM_ALPHABET[31]}${ROOM_ALPHABET[5]}`)
    for (let i = 0; i < 200; i += 1) expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/)
  })

  it('rejects bad names, codes, answers, and chat', () => {
    expect(parseName('A').ok).toBe(false)
    expect(parseName('  Ada  ').ok && parseName('  Ada  ')).toMatchObject({ ok: true, name: 'Ada' })
    expect(parseName('Mary Ann').ok).toBe(true)
    expect(parseName('A'.repeat(17)).ok).toBe(false)
    expect(parseName('<b>').ok).toBe(false)
    expect(parseCode('iiiii').ok).toBe(false)
    expect(parseCode('ab-cde')).toMatchObject({ ok: true, code: 'ABCDE' })
    expect(parseAnswer('').message).toMatch(/four-digit/i)
    expect(parseAnswer('123').ok).toBe(false)
    expect(parseAnswer('12345').ok).toBe(false)
    expect(parseAnswer('12a4').ok).toBe(false)
    expect(parseAnswer('0000')).toMatchObject({ ok: true, answer: '0000' })
    expect(parseChat('   ', 200).ok).toBe(false)
    expect(parseChat('hello\u0000 there', 200)).toMatchObject({ ok: true, text: 'hello there' })
    expect(parseChat('x'.repeat(201), 200).ok).toBe(false)
  })

  it('rejects an out-of-range round length', () => {
    expect(() => loadConfig({ ROUND_MS_EASY: '0' })).toThrow(/ROUND_MS_EASY/)
    expect(loadConfig({}).roundMs.easy).toBe(180_000)
    expect(loadConfig({ ROUND_MS_EASY: '' }).roundMs.easy).toBe(180_000)
  })
})

describe('puzzles', () => {
  it('has 14 missions, unique answers, and three difficulties', () => {
    expect(campaign).toHaveLength(14)
    expect(new Set(campaign.map((puzzle) => puzzle.answer)).size).toBe(14)
    expect(campaign.slice(0, 3).every((puzzle) => puzzle.difficulty === 'easy')).toBe(true)
    expect(campaign.some((puzzle) => puzzle.difficulty === 'medium')).toBe(true)
    expect(campaign.some((puzzle) => puzzle.difficulty === 'hard')).toBe(true)
    for (const puzzle of campaign) expect(puzzle.answer).toMatch(/^\d{4}$/)
  })

  it('gives every puzzle exactly one solution and keeps each bundle short of that', () => {
    for (const puzzle of campaign) {
      const all = puzzle.bundles.flat()
      expect(solutionsFor(all)).toEqual([puzzle.answer])
      for (const bundle of puzzle.bundles) expect(solutionsFor(bundle).length).toBeGreaterThan(1)
      for (const clue of all) {
        expect(clue.holds(puzzle.answer.split('').map(Number))).toBe(true)
        expect(solutionsFor([clue]).length).toBeGreaterThan(1)
      }
    }
  })

  it('splits fragments so no agent receives both bundles', () => {
    for (const puzzle of campaign) {
      const texts = [puzzle.bundles[0].map((clue) => clue.text), puzzle.bundles[1].map((clue) => clue.text)]
      for (let count = 2; count <= 6; count += 1) {
        const ids = Array.from({ length: count }, (_, index) => `p${index}`)
        const assigned = assignClues(puzzle, ids)
        const seen = new Set<string>()
        for (const [id, clues] of assigned) {
          const held = clues.map((clue) => clue.text)
          held.forEach((text) => seen.add(text))
          const sides = new Set(held.map((text) => (texts[0].includes(text) ? 0 : texts[1].includes(text) ? 1 : -1)))
          expect(sides.has(-1)).toBe(false)
          expect(sides.size).toBeLessThanOrEqual(1)
          if (held.length > 0) expect(solutionsFor(clues).length).toBeGreaterThan(1)
          expect(id.startsWith('p')).toBe(true)
        }
        expect([...seen].sort()).toEqual(puzzle.bundles.flat().map((clue) => clue.text).sort())
      }
    }
  })
})

describe('scoring', () => {
  it('pays base, time, and unused attempts once, and never goes negative', () => {
    const win = scoreMission({ won: true, difficulty: 'easy', remainingMs: 142_900, attemptsUsed: 1, maxAttempts: 5 })
    expect(win).toMatchObject({ base: 500, timeBonus: 284, attemptBonus: 160, total: 944, remainingSeconds: 142, attemptsLeft: 4 })
    const loss = scoreMission({ won: false, difficulty: 'hard', remainingMs: 0, attemptsUsed: 5, maxAttempts: 5 })
    expect(loss.total).toBe(0)
    const clamped = scoreMission({ won: true, difficulty: 'medium', remainingMs: -50, attemptsUsed: 9, maxAttempts: 5 })
    expect(clamped.remainingSeconds).toBe(0)
    expect(clamped.attemptsLeft).toBe(0)
    expect(clamped.total).toBeGreaterThanOrEqual(0)
  })
})

describe('rate limiter', () => {
  it('blocks the request that exceeds the window', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1_000, () => now)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.blocked('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    now = 1_001
    expect(limiter.allow('a')).toBe(true)
  })
})

describe('room engine', () => {
  it('starts only for a ready host with at least two players', () => {
    const env = boot()
    expect(env.store.start(env.code, env.guest.playerId)).toMatchObject({ ok: false, error: 'NOT_HOST' })
    expect(env.store.start(env.code, env.host.playerId)).toMatchObject({ ok: false, error: 'NOT_READY' })
    const alone = env.store.create('Cy')
    if (!alone.ok) throw new Error(alone.message)
    expect(env.store.start(alone.data.code, alone.data.playerId)).toMatchObject({ ok: false, error: 'NEED_PLAYERS' })
    readyAndStart(env)
    const state = env.store.publicByCode(env.code)
    expect(state?.phase).toBe('IN_PROGRESS')
  })

  it('keeps private fragments and the answer off the public payload', () => {
    const env = boot()
    readyAndStart(env)
    const puzzle = campaign[0]
    const ada = env.store.snapshot(env.code, env.host.playerId)
    const bo = env.store.snapshot(env.code, env.guest.playerId)
    expect(ada && bo).toBeTruthy()
    const adaText = ada!.private.clues.map((clue) => clue.text)
    const boText = bo!.private.clues.map((clue) => clue.text)
    expect(adaText).toEqual(puzzle.bundles[0].map((clue) => clue.text))
    expect(boText).toEqual(puzzle.bundles[1].map((clue) => clue.text))
    expect(collect(ada!.state)).not.toContain(puzzle.answer)
    for (const text of boText) expect(collect(ada!.state)).not.toContain(text)
    for (const text of boText) expect(collect(ada!.private)).not.toContain(text)
    expect(ada!.state.reveal).toBeNull()
  })

  it('awards a win once, rejects a late correct code, and ends on penalties', () => {
    const env = boot()
    readyAndStart(env)
    const answer = campaign[0].answer
    const wrong = env.store.submit(env.code, env.guest.playerId, '0000')
    expect(wrong).toMatchObject({ ok: true, data: { correct: false, ended: false } })
    const first = env.store.submit(env.code, env.host.playerId, answer)
    const second = env.store.submit(env.code, env.guest.playerId, answer)
    expect(first).toMatchObject({ ok: true, data: { correct: true } })
    expect(second).toMatchObject({ ok: false, error: 'ALREADY_ENDED' })
    const won = env.store.publicByCode(env.code)
    expect(won?.phase).toBe('WON')
    expect(won?.teamScore).toBe(won?.reveal?.scoreAwarded)
    expect(won?.teamScore).toBeGreaterThan(0)
    expect(env.store.replay(env.code, env.guest.playerId)).toMatchObject({ ok: false, error: 'NOT_HOST' })
    expect(env.store.replay(env.code, env.host.playerId).ok).toBe(true)
    expect(env.store.submit(env.code, env.host.playerId, answer).ok).toBe(true)
    const replayed = env.store.publicByCode(env.code)
    expect(replayed?.teamScore).toBe(won?.teamScore)
    expect(replayed?.reveal?.alreadyAwarded).toBe(true)
    expect(replayed?.reveal?.scoreAwarded).toBe(0)
  })

  it('fails a correct code once the server clock has reached zero', () => {
    const env = boot()
    readyAndStart(env)
    const deadline = env.store.publicByCode(env.code)?.deadline ?? 0
    env.setNow(deadline)
    const result = env.store.submit(env.code, env.host.playerId, campaign[0].answer)
    expect(result).toMatchObject({ ok: true, data: { correct: false, ended: true } })
    const state = env.store.publicByCode(env.code)
    expect(state?.phase).toBe('LOST')
    expect(state?.endReason).toBe('TIME')
    expect(state?.teamScore).toBe(0)
    expect(state?.attemptsUsed).toBe(0)
  })

  it('ends on the last attempt and when a time penalty crosses zero', () => {
    const attempts = boot({ penaltyMs: 0, submitLimit: 10 })
    readyAndStart(attempts)
    for (let i = 0; i < 5; i += 1) {
      const result = attempts.store.submit(attempts.code, attempts.host.playerId, '0000')
      expect(result.ok).toBe(true)
    }
    expect(attempts.store.publicByCode(attempts.code)?.endReason).toBe('ATTEMPTS')
    expect(attempts.store.submit(attempts.code, attempts.host.playerId, campaign[0].answer)).toMatchObject({ ok: false, error: 'ALREADY_ENDED' })

    const timed = boot()
    readyAndStart(timed)
    const deadline = timed.store.publicByCode(timed.code)?.deadline ?? 0
    timed.setNow(deadline - 10_000)
    timed.store.submit(timed.code, timed.host.playerId, '1111')
    expect(timed.store.publicByCode(timed.code)?.endReason).toBe('TIME')
  })

  it('lets a fifth-attempt solve score with no attempt bonus', () => {
    const env = boot({ penaltyMs: 0 })
    readyAndStart(env)
    for (let i = 0; i < 4; i += 1) env.store.submit(env.code, env.host.playerId, '0000')
    env.store.submit(env.code, env.guest.playerId, campaign[0].answer)
    const state = env.store.publicByCode(env.code)
    expect(state?.phase).toBe('WON')
    expect(state?.reveal?.breakdown.attemptsLeft).toBe(0)
    expect(state?.reveal?.breakdown.attemptBonus).toBe(0)
    expect(state?.teamScore).toBeGreaterThan(0)
  })

  it('transfers the host, removes stale players, and restores a resume', () => {
    const lobby = boot()
    lobby.store.markDisconnected(lobby.code, lobby.host.playerId, 'ada')
    expect(lobby.store.publicByCode(lobby.code)?.hostId).toBe(lobby.guest.playerId)

    const live = boot()
    readyAndStart(live)
    const clues = live.store.snapshot(live.code, live.host.playerId)?.private.clues
    live.store.markDisconnected(live.code, live.host.playerId, 'ada')
    live.setNow(1_000_000 + 999)
    live.store.tick()
    expect(live.store.publicByCode(live.code)?.hostId).toBe(live.host.playerId)
    live.setNow(1_000_000 + 1_000)
    live.store.tick()
    expect(live.store.publicByCode(live.code)?.hostId).toBe(live.guest.playerId)
    const resumed = live.store.resume(live.code, live.host.token, 'ada-2')
    expect(resumed.ok).toBe(true)
    expect(live.store.snapshot(live.code, live.host.playerId)?.private.clues).toEqual(clues)

    const droppedAt = 1_000_000 + 1_000
    live.setNow(droppedAt)
    live.store.markDisconnected(live.code, live.guest.playerId, 'bo')
    live.setNow(droppedAt + 5_000)
    live.store.tick()
    expect(live.store.publicByCode(live.code)?.players.some((player) => player.id === live.guest.playerId)).toBe(false)
  })

  it('handles a late joiner, a leaver, a full room, and expiry', () => {
    const env = boot()
    readyAndStart(env)
    const late = env.store.join(env.code, 'Cy')
    if (!late.ok) throw new Error(late.message)
    const lateView = env.store.snapshot(env.code, late.data.playerId)
    expect(lateView?.private.observer).toBe(true)
    expect(lateView?.private.clues).toEqual([])
    expect(collect(lateView?.state)).not.toContain(campaign[0].answer)
    expect(env.store.submit(env.code, late.data.playerId, campaign[0].answer).ok).toBe(true)

    const again = boot()
    readyAndStart(again)
    const orphan = again.store.snapshot(again.code, again.guest.playerId)?.private.clues.map((clue) => clue.text)
    expect(again.store.leave(again.code, again.guest.playerId).ok).toBe(true)
    const replacement = again.store.join(again.code, 'Dee')
    if (!replacement.ok) throw new Error(replacement.message)
    expect(again.store.snapshot(again.code, replacement.data.playerId)?.private.clues.map((clue) => clue.text)).toEqual(orphan)

    const room = boot()
    expect(room.store.join(room.code, 'bo')).toMatchObject({ ok: false, error: 'DUPLICATE_NAME' })
    for (const name of ['Cy', 'Dee', 'Eve', 'Fay']) {
      expect(room.store.join(room.code, name).ok).toBe(true)
    }
    expect(room.store.join(room.code, 'Gus')).toMatchObject({ ok: false, error: 'ROOM_FULL' })
    expect(room.store.join('NO-SUCH', 'Ada')).toMatchObject({ ok: false, error: 'INVALID_CODE' })
    expect(room.store.join('ZZZZZ', 'Ada')).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' })

    room.setNow(1_000_000 + 60_000)
    expect(room.store.join(room.code, 'Hex')).toMatchObject({ ok: false, error: 'ROOM_EXPIRED' })
    expect(room.store.tick().expired).toContain(room.code)
  })

  it('rate limits chat and rejects bad submissions without sticking the phase', () => {
    const env = boot({ chatLimit: 2 })
    expect(env.store.chat(env.code, env.host.playerId, 'one').ok).toBe(true)
    expect(env.store.chat(env.code, env.host.playerId, 'two').ok).toBe(true)
    expect(env.store.chat(env.code, env.host.playerId, 'three')).toMatchObject({ ok: false, error: 'RATE_LIMIT' })
    expect(env.store.submit(env.code, env.host.playerId, '')).toMatchObject({ ok: false, error: 'INVALID_ANSWER' })
    expect(env.store.publicByCode(env.code)?.phase).toBe('WAITING')
    expect(env.store.next(env.code, env.host.playerId)).toMatchObject({ ok: false, error: 'BAD_PHASE' })
  })
})
