import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { assignClues } from './assign.js'
import { generateRoomCode } from './codes.js'
import { campaign, puzzleById, type Puzzle } from './puzzles.js'
import { rulesView, type GameConfig } from '../shared/config.js'
import { scoreMission } from '../shared/scoring.js'
import type {
  ChatMessage,
  EndReason,
  MissionHistoryEntry,
  Phase,
  PrivateView,
  PublicState,
  ScoreBreakdown,
} from '../shared/types.js'
import { nameKey, parseAnswer, parseChat, parseCode, parseName } from '../shared/validate.js'

const SUPPORT_NOTE =
  'You joined after this mission started, so you were not issued a private fragment. You can still compare notes in chat and transmit a code the squad agrees on. You will receive a fragment on the next mission.'

export interface ActionOk<T> {
  ok: true
  code: string
  message?: string
  data: T
}

export interface ActionFail {
  ok: false
  error: string
  message: string
  code?: string
  changed?: boolean
}

export type ActionResult<T> = ActionOk<T> | ActionFail

interface Player {
  id: string
  tokenHash: Buffer
  name: string
  order: number
  connected: boolean
  disconnectedAt: number | null
  ready: boolean
  socketId: string | null
  clues: string[]
  assignedThisMission: boolean
  chatHits: number[]
  submitHits: number[]
}

interface Room {
  code: string
  createdAt: number
  expiresAt: number
  emptySince: number | null
  hostId: string
  phase: Phase
  missionIndex: number
  puzzleId: string | null
  durationMs: number | null
  deadline: number | null
  startedAt: number | null
  attemptsUsed: number
  teamScore: number
  endReason: EndReason | null
  awarded: Set<string>
  lastBreakdown: ScoreBreakdown | null
  lastScoreAwarded: number
  lastAlreadyAwarded: boolean
  history: MissionHistoryEntry[]
  chat: ChatMessage[]
  unassignedClues: string[]
  players: Map<string, Player>
  version: number
}

export interface SessionData {
  token: string
  playerId: string
  code: string
  name: string
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>()
  private readonly now: () => number
  private joinOrder = 1
  readonly config: GameConfig

  constructor(options: { config: GameConfig; now?: () => number }) {
    this.config = options.config
    this.now = options.now ?? (() => Date.now())
  }

  create(rawName: unknown): ActionResult<SessionData> {
    const name = parseName(rawName, this.config)
    if (!name.ok) return fail('INVALID_NAME', name.message)
    const token = randomBytes(32).toString('hex')
    const player = this.makePlayer(name.name, token)
    const room = this.makeRoom(player)
    this.system(room, `${player.name} opened the room. Share the code with your squad.`)
    room.version = 1
    return ok(room.code, { token, playerId: player.id, code: room.code, name: player.name })
  }

  join(rawCode: unknown, rawName: unknown): ActionResult<SessionData> {
    const code = parseCode(rawCode, this.config.codeLength)
    if (!code.ok) return fail('INVALID_CODE', code.message)
    const name = parseName(rawName, this.config)
    if (!name.ok) return fail('INVALID_NAME', name.message)
    const room = this.rooms.get(code.code)
    if (!room) return fail('ROOM_NOT_FOUND', 'No active room uses that code. Check it with the host.', code.code)
    if (this.now() >= room.expiresAt) return fail('ROOM_EXPIRED', 'This room has expired. Ask the host to create a new one.', room.code)
    if (room.players.size >= this.config.maxPlayers) {
      return fail('ROOM_FULL', `This room is full (${this.config.maxPlayers} agents).`, room.code)
    }
    if ([...room.players.values()].some((player) => nameKey(player.name) === nameKey(name.name))) {
      return fail('DUPLICATE_NAME', 'That name is already in this room. Choose another.', room.code)
    }
    const token = randomBytes(32).toString('hex')
    const player = this.makePlayer(name.name, token)
    if (room.phase === 'IN_PROGRESS' && room.unassignedClues.length > 0) {
      player.clues = [...new Set(room.unassignedClues)]
      player.assignedThisMission = true
      room.unassignedClues = []
      this.system(room, `${player.name} joined and picked up an unassigned fragment.`)
    } else if (room.phase === 'IN_PROGRESS') {
      player.assignedThisMission = false
      this.system(room, `${player.name} joined mid-mission without a private fragment.`)
    } else {
      this.system(room, `${player.name} joined the squad.`)
    }
    room.players.set(player.id, player)
    this.syncLobby(room)
    room.version += 1
    return ok(room.code, { token, playerId: player.id, code: room.code, name: player.name }, 'You joined the room.')
  }

  resume(rawCode: unknown, rawToken: unknown, socketId: string | null): ActionResult<SessionData> {
    const code = parseCode(rawCode, this.config.codeLength)
    if (!code.ok) return fail('INVALID_CODE', code.message)
    if (typeof rawToken !== 'string' || rawToken.length < 32) {
      return fail('UNAUTHORIZED', 'Your session is missing. Join the room again with your name.')
    }
    const room = this.rooms.get(code.code)
    if (!room) return fail('ROOM_NOT_FOUND', 'That room is no longer available.', code.code)
    if (this.now() >= room.expiresAt) return fail('ROOM_EXPIRED', 'This room has expired.', room.code)
    const hash = sha(rawToken)
    const player = [...room.players.values()].find((candidate) => sameHash(candidate.tokenHash, hash))
    if (!player) return fail('UNAUTHORIZED', 'Your session expired. Join again with your name.', room.code)
    player.connected = true
    player.disconnectedAt = null
    player.socketId = socketId
    room.emptySince = null
    room.version += 1
    return ok(room.code, { token: rawToken, playerId: player.id, code: room.code, name: player.name }, 'Reconnected.')
  }

  bind(code: string, playerId: string, socketId: string): void {
    const room = this.rooms.get(code)
    const player = room?.players.get(playerId)
    if (!player) return
    player.socketId = socketId
    player.connected = true
    player.disconnectedAt = null
  }

  markDisconnected(code: string, playerId: string, socketId: string): boolean {
    const room = this.rooms.get(code)
    const player = room?.players.get(playerId)
    if (!room || !player) return false
    if (player.socketId !== socketId) return false
    player.connected = false
    player.socketId = null
    player.disconnectedAt = this.now()
    player.ready = false
    this.maybeTransferHost(room)
    this.syncLobby(room)
    if (this.connected(room).length === 0) room.emptySince = this.now()
    room.version += 1
    return true
  }

  setReady(code: string, playerId: string, ready: boolean): ActionResult<{ ready: boolean }> {
    const found = this.requirePlayer(code, playerId)
    if (!found.ok) return found
    const { room, player } = found
    if (room.phase !== 'WAITING' && room.phase !== 'READY') {
      return fail('BAD_PHASE', 'Ready is only used in the lobby.', room.code)
    }
    if (!player.connected) return fail('NOT_IN_ROOM', 'Reconnect before readying up.', room.code)
    player.ready = ready
    this.syncLobby(room)
    room.version += 1
    return ok(room.code, { ready })
  }

  start(code: string, playerId: string): ActionResult<Record<string, never>> {
    const found = this.requireHost(code, playerId)
    if (!found.ok) return found
    const { room } = found
    const connected = this.connected(room)
    if (connected.length < this.config.minPlayers) {
      return fail('NEED_PLAYERS', `At least ${this.config.minPlayers} connected agents are required.`, room.code)
    }
    if (room.phase === 'WAITING') {
      return fail('NOT_READY', 'Every connected agent must be ready before the mission starts.', room.code)
    }
    if (room.phase !== 'READY') {
      return fail('BAD_PHASE', 'The mission cannot be started from this state.', room.code)
    }
    this.begin(room)
    room.version += 1
    return ok(room.code, {}, 'Mission started.')
  }

  submit(code: string, playerId: string, rawAnswer: unknown): ActionResult<{ correct: boolean; ended: boolean }> {
    const found = this.requirePlayer(code, playerId)
    if (!found.ok) return found
    const { room, player } = found
    if (!this.allow(player.submitHits, this.config.submitLimit, this.config.submitWindowMs)) {
      return fail('RATE_LIMIT', 'Too many transmissions. Wait a moment.', room.code)
    }
    const answer = parseAnswer(rawAnswer)
    if (!answer.ok) return fail('INVALID_ANSWER', answer.message, room.code)
    if (room.phase !== 'IN_PROGRESS' || room.deadline == null) {
      return fail('ALREADY_ENDED', 'That mission is not accepting a code right now.', room.code)
    }
    const at = this.now()
    if (at >= room.deadline) {
      this.finish(room, 'TIME')
      room.version += 1
      return ok(room.code, { correct: false, ended: true }, 'The clock hit zero before the code was accepted.')
    }
    const puzzle = this.currentPuzzle(room)
    if (answer.answer === puzzle.answer) {
      room.attemptsUsed += 1
      this.finish(room, 'SOLVED')
      room.version += 1
      return ok(room.code, { correct: true, ended: true }, 'Code accepted.')
    }
    room.attemptsUsed += 1
    room.deadline -= this.config.penaltyMs
    const attemptsLeft = this.config.maxAttempts - room.attemptsUsed
    const penaltySeconds = Math.round(this.config.penaltyMs / 1000)
    if (room.attemptsUsed >= this.config.maxAttempts) {
      this.finish(room, 'ATTEMPTS')
      room.version += 1
      return ok(room.code, { correct: false, ended: true }, 'Incorrect code. No attempts left.')
    }
    if (this.now() >= room.deadline) {
      this.finish(room, 'TIME')
      room.version += 1
      return ok(room.code, { correct: false, ended: true }, 'Incorrect code. The time penalty ended the mission.')
    }
    this.system(room, `${player.name} transmitted ${answer.answer}. Incorrect. ${attemptsLeft} attempts left. ${penaltySeconds}s removed.`)
    room.version += 1
    return ok(
      room.code,
      { correct: false, ended: false },
      `Incorrect code. ${attemptsLeft} attempts left. ${penaltySeconds} seconds removed.`,
    )
  }

  chat(code: string, playerId: string, rawText: unknown): ActionResult<{ id: string }> {
    const found = this.requirePlayer(code, playerId)
    if (!found.ok) return found
    const { room, player } = found
    if (!this.allow(player.chatHits, this.config.chatLimit, this.config.chatWindowMs)) {
      return fail('RATE_LIMIT', 'Too many messages. Wait a moment.', room.code)
    }
    const text = parseChat(rawText, this.config.chatMaxLen)
    if (!text.ok) return fail(text.error, text.message, room.code)
    const message: ChatMessage = {
      id: randomBytes(6).toString('hex'),
      playerId: player.id,
      name: player.name,
      text: text.text,
      at: this.now(),
      system: false,
    }
    this.pushChat(room, message)
    room.version += 1
    return ok(room.code, { id: message.id })
  }

  leave(code: string, playerId: string): ActionResult<{ deleted: boolean }> {
    const found = this.requirePlayer(code, playerId)
    if (!found.ok) return found
    const { room, player } = found
    this.dropPlayer(room, player, 'left')
    if (room.players.size === 0) {
      this.rooms.delete(room.code)
      return ok(room.code, { deleted: true }, 'You left the room.')
    }
    room.version += 1
    return ok(room.code, { deleted: false }, 'You left the room.')
  }

  next(code: string, playerId: string): ActionResult<Record<string, never>> {
    const found = this.requireHost(code, playerId)
    if (!found.ok) return found
    const { room } = found
    if (room.phase === 'COMPLETED') return fail('CAMPAIGN_DONE', 'The campaign is complete. Reset it to play again.', room.code)
    if (room.phase !== 'WON') return fail('BAD_PHASE', 'Win this mission before moving on. You can replay it.', room.code)
    if (this.connected(room).length < this.config.minPlayers) {
      return fail('NEED_PLAYERS', `At least ${this.config.minPlayers} connected agents are required.`, room.code)
    }
    room.missionIndex += 1
    this.begin(room)
    room.version += 1
    return ok(room.code, {}, 'Next mission started.')
  }

  replay(code: string, playerId: string): ActionResult<Record<string, never>> {
    const found = this.requireHost(code, playerId)
    if (!found.ok) return found
    const { room } = found
    if (room.phase !== 'WON' && room.phase !== 'LOST' && room.phase !== 'COMPLETED') {
      return fail('BAD_PHASE', 'Replay is available after a mission ends.', room.code)
    }
    if (this.connected(room).length < this.config.minPlayers) {
      return fail('NEED_PLAYERS', `At least ${this.config.minPlayers} connected agents are required.`, room.code)
    }
    this.begin(room)
    room.version += 1
    return ok(room.code, {}, 'Mission replay started. Points are awarded only once.')
  }

  reset(code: string, playerId: string): ActionResult<Record<string, never>> {
    const found = this.requireHost(code, playerId)
    if (!found.ok) return found
    const { room } = found
    if (room.phase === 'IN_PROGRESS') return fail('BAD_PHASE', 'Finish or wait out the current mission before resetting.', room.code)
    room.missionIndex = 0
    room.teamScore = 0
    room.history = []
    room.awarded.clear()
    room.puzzleId = null
    room.durationMs = null
    room.deadline = null
    room.startedAt = null
    room.attemptsUsed = 0
    room.endReason = null
    room.lastBreakdown = null
    room.lastScoreAwarded = 0
    room.lastAlreadyAwarded = false
    room.unassignedClues = []
    for (const player of room.players.values()) {
      player.ready = false
      player.clues = []
      player.assignedThisMission = false
    }
    room.phase = 'WAITING'
    this.system(room, 'The host reset the campaign. Team score is back to zero.')
    this.syncLobby(room)
    room.version += 1
    return ok(room.code, {}, 'Campaign reset.')
  }

  tick(): { updated: string[]; expired: string[] } {
    const updated: string[] = []
    const expired: string[] = []
    for (const room of this.rooms.values()) {
      if (this.now() >= room.expiresAt) {
        expired.push(room.code)
        continue
      }
      let changed = false
      if (this.maybeTransferHost(room)) changed = true
      if (this.removeStale(room)) changed = true
      if (room.players.size === 0) {
        expired.push(room.code)
        continue
      }
      const connected = this.connected(room)
      if (connected.length === 0) {
        if (room.emptySince == null) {
          room.emptySince = this.now()
          changed = true
        } else if (this.now() - room.emptySince >= this.config.emptyRoomMs) {
          expired.push(room.code)
          continue
        }
      } else if (room.emptySince != null) {
        room.emptySince = null
        changed = true
      }
      if (room.phase === 'IN_PROGRESS' && room.deadline != null && this.now() >= room.deadline) {
        this.finish(room, 'TIME')
        changed = true
      }
      if (changed) {
        room.version += 1
        updated.push(room.code)
      }
    }
    return { updated, expired }
  }

  socketIds(code: string): string[] {
    const room = this.rooms.get(code)
    if (!room) return []
    return [...room.players.values()].flatMap((player) => (player.socketId ? [player.socketId] : []))
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code)
  }

  roomCount(): number {
    return this.rooms.size
  }

  snapshot(code: string, playerId: string): { state: PublicState; private: PrivateView } | null {
    const room = this.rooms.get(code)
    const player = room?.players.get(playerId)
    if (!room || !player) return null
    return { state: this.publicState(room), private: this.privateState(room, player) }
  }

  publicByCode(code: string): PublicState | null {
    const room = this.rooms.get(code)
    return room ? this.publicState(room) : null
  }

  private begin(room: Room): void {
    const puzzle = campaign[room.missionIndex]
    if (!puzzle) throw new Error('Mission index is out of range.')
    const connected = this.connected(room)
    const assignment = assignClues(puzzle, connected.map((player) => player.id))
    room.puzzleId = puzzle.id
    room.phase = 'IN_PROGRESS'
    room.durationMs = this.config.roundMs[puzzle.difficulty]
    room.startedAt = this.now()
    room.deadline = this.now() + room.durationMs
    room.attemptsUsed = 0
    room.endReason = null
    room.lastBreakdown = null
    room.lastScoreAwarded = 0
    room.lastAlreadyAwarded = false
    room.unassignedClues = []
    for (const player of room.players.values()) {
      const clues = assignment.get(player.id) ?? []
      player.clues = [...new Set(clues.map((clue) => clue.text))]
      player.assignedThisMission = connected.some((candidate) => candidate.id === player.id)
      player.ready = false
    }
    this.system(room, `Mission ${room.missionIndex + 1}, ${puzzle.title}, is live. Trade fragments before you transmit.`)
  }

  private finish(room: Room, reason: EndReason): void {
    if (room.phase !== 'IN_PROGRESS') return
    const puzzle = this.currentPuzzle(room)
    const won = reason === 'SOLVED'
    const remainingMs = Math.max(0, (room.deadline ?? this.now()) - this.now())
    const elapsedSeconds = Math.max(0, Math.floor((this.now() - (room.startedAt ?? this.now())) / 1000))
    const already = room.awarded.has(puzzle.id)
    let breakdown = scoreMission(
      {
        won,
        difficulty: puzzle.difficulty,
        remainingMs,
        attemptsUsed: room.attemptsUsed,
        maxAttempts: this.config.maxAttempts,
      },
      this.config,
    )
    let scoreAwarded = breakdown.total
    if (won && already) {
      scoreAwarded = 0
      breakdown = { ...breakdown, base: 0, timeBonus: 0, attemptBonus: 0, total: 0 }
    }
    if (won && !already) {
      room.teamScore += scoreAwarded
      room.awarded.add(puzzle.id)
    }
    room.lastBreakdown = breakdown
    room.lastScoreAwarded = scoreAwarded
    room.lastAlreadyAwarded = won && already
    room.endReason = reason
    const finalWin = won && room.missionIndex >= campaign.length - 1
    room.phase = won ? (finalWin ? 'COMPLETED' : 'WON') : 'LOST'
    room.history.push({
      missionNumber: room.missionIndex + 1,
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      outcome: won ? 'WON' : 'LOST',
      scoreAwarded,
      attemptsUsed: room.attemptsUsed,
      elapsedSeconds,
      remainingSeconds: breakdown.remainingSeconds,
    })
    if (room.history.length > 50) room.history.splice(0, room.history.length - 50)
    this.system(
      room,
      won
        ? 'The code is correct. Mission successful.'
        : reason === 'TIME'
          ? 'The clock hit zero. Mission failed.'
          : 'Attempts exhausted. Mission failed.',
    )
  }

  private dropPlayer(room: Room, player: Player, verb: 'left' | 'timed out'): void {
    const stillHeld = new Set(
      [...room.players.values()].filter((candidate) => candidate.id !== player.id).flatMap((candidate) => candidate.clues),
    )
    for (const clue of player.clues) {
      if (!stillHeld.has(clue)) room.unassignedClues.push(clue)
    }
    const wasHost = room.hostId === player.id
    room.players.delete(player.id)
    if (room.players.size === 0) return
    if (wasHost) {
      const next = this.connected(room)[0] ?? [...room.players.values()].sort(byJoin)[0]
      if (next) {
        room.hostId = next.id
        this.system(room, `${player.name} ${verb}. ${next.name} is now the host.`)
      }
    } else {
      this.system(room, `${player.name} ${verb}.`)
    }
    this.syncLobby(room)
  }

  private removeStale(room: Room): boolean {
    let changed = false
    for (const player of [...room.players.values()]) {
      if (player.connected || player.disconnectedAt == null) continue
      if (this.now() - player.disconnectedAt < this.config.disconnectRemoveMs) continue
      this.dropPlayer(room, player, 'timed out')
      changed = true
      if (room.players.size === 0) break
    }
    return changed
  }

  private maybeTransferHost(room: Room): boolean {
    const host = room.players.get(room.hostId)
    if (!host) {
      const next = this.connected(room)[0]
      if (!next) return false
      room.hostId = next.id
      this.system(room, `${next.name} is now the host.`)
      return true
    }
    if (host.connected || host.disconnectedAt == null) return false
    const lobby = room.phase === 'WAITING' || room.phase === 'READY'
    const grace = lobby ? 0 : this.config.hostGraceMs
    if (this.now() - host.disconnectedAt < grace) return false
    const next = this.connected(room)[0]
    if (!next) return false
    room.hostId = next.id
    this.system(
      room,
      lobby
        ? `${host.name} disconnected. ${next.name} is now the host.`
        : `${host.name} lost the link. ${next.name} is now the host.`,
    )
    return true
  }

  private syncLobby(room: Room): void {
    if (room.phase !== 'WAITING' && room.phase !== 'READY') return
    const connected = this.connected(room)
    const ready = connected.length >= this.config.minPlayers && connected.every((player) => player.ready)
    room.phase = ready ? 'READY' : 'WAITING'
  }

  private currentPuzzle(room: Room): Puzzle {
    const puzzle = room.puzzleId ? puzzleById(room.puzzleId) : campaign[room.missionIndex]
    if (!puzzle) throw new Error('Puzzle is missing.')
    return puzzle
  }

  private upcoming(room: Room): Puzzle {
    return campaign[Math.min(room.missionIndex, campaign.length - 1)]
  }

  private makeRoom(host: Player): Room {
    let code = ''
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateRoomCode()
      if (!this.rooms.has(candidate)) {
        code = candidate
        break
      }
    }
    if (!code) throw new Error('Could not allocate a room code.')
    const now = this.now()
    const room: Room = {
      code,
      createdAt: now,
      expiresAt: now + this.config.roomTtlMs,
      emptySince: null,
      hostId: host.id,
      phase: 'WAITING',
      missionIndex: 0,
      puzzleId: null,
      durationMs: null,
      deadline: null,
      startedAt: null,
      attemptsUsed: 0,
      teamScore: 0,
      endReason: null,
      awarded: new Set(),
      lastBreakdown: null,
      lastScoreAwarded: 0,
      lastAlreadyAwarded: false,
      history: [],
      chat: [],
      unassignedClues: [],
      players: new Map([[host.id, host]]),
      version: 0,
    }
    this.rooms.set(code, room)
    return room
  }

  private makePlayer(name: string, token: string): Player {
    return {
      id: randomBytes(8).toString('hex'),
      tokenHash: sha(token),
      name,
      order: this.joinOrder++,
      connected: true,
      disconnectedAt: null,
      ready: false,
      socketId: null,
      clues: [],
      assignedThisMission: false,
      chatHits: [],
      submitHits: [],
    }
  }

  private connected(room: Room): Player[] {
    return [...room.players.values()].filter((player) => player.connected).sort(byJoin)
  }

  private requirePlayer(code: string, playerId: string): { ok: true; room: Room; player: Player } | ActionFail {
    const parsed = parseCode(code, this.config.codeLength)
    if (!parsed.ok) return fail('INVALID_CODE', parsed.message)
    const room = this.rooms.get(parsed.code)
    if (!room) return fail('NOT_IN_ROOM', 'You are not in an active room.', parsed.code)
    const player = room.players.get(playerId)
    if (!player) return fail('NOT_IN_ROOM', 'You are not in this room.', room.code)
    return { ok: true, room, player }
  }

  private requireHost(code: string, playerId: string): { ok: true; room: Room; player: Player } | ActionFail {
    const found = this.requirePlayer(code, playerId)
    if (!found.ok) return found
    if (found.room.hostId !== playerId) return fail('NOT_HOST', 'Only the host can do that.', found.room.code)
    return found
  }

  private allow(bucket: number[], limit: number, windowMs: number): boolean {
    const t = this.now()
    while (bucket.length > 0 && t - bucket[0] >= windowMs) bucket.shift()
    if (bucket.length >= limit) return false
    bucket.push(t)
    return true
  }

  private system(room: Room, text: string): void {
    this.pushChat(room, {
      id: randomBytes(6).toString('hex'),
      playerId: null,
      name: 'Control',
      text,
      at: this.now(),
      system: true,
    })
  }

  private pushChat(room: Room, message: ChatMessage): void {
    room.chat.push(message)
    if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80)
  }

  private publicState(room: Room): PublicState {
    const upcoming = this.upcoming(room)
    const terminal = room.phase === 'WON' || room.phase === 'LOST' || room.phase === 'COMPLETED'
    const puzzle = room.puzzleId ? puzzleById(room.puzzleId) ?? upcoming : upcoming
    return {
      code: room.code,
      phase: room.phase,
      version: room.version,
      serverNow: this.now(),
      expiresAt: room.expiresAt,
      hostId: room.hostId,
      players: [...room.players.values()].sort(byJoin).map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        connected: player.connected,
        isHost: player.id === room.hostId,
      })),
      missionNumber: room.missionIndex + 1,
      missionCount: campaign.length,
      title: puzzle.title,
      difficulty: puzzle.difficulty,
      durationMs: room.durationMs,
      deadline: room.deadline,
      startedAt: room.startedAt,
      attemptsUsed: room.attemptsUsed,
      maxAttempts: this.config.maxAttempts,
      teamScore: room.teamScore,
      endReason: room.endReason,
      history: room.history,
      chat: room.chat,
      reveal:
        terminal && room.lastBreakdown
          ? {
              answer: puzzle.answer,
              explanation: puzzle.explanation,
              clues: puzzle.bundles.flat().map((clue) => ({ text: clue.text })),
              breakdown: room.lastBreakdown,
              scoreAwarded: room.lastScoreAwarded,
              alreadyAwarded: room.lastAlreadyAwarded,
            }
          : null,
      rules: rulesView(this.config, campaign.length),
    }
  }

  private privateState(room: Room, player: Player): PrivateView {
    const observer = room.phase === 'IN_PROGRESS' && !player.assignedThisMission
    return {
      playerId: player.id,
      isHost: room.hostId === player.id,
      observer,
      canSubmit: room.phase === 'IN_PROGRESS' && player.connected,
      clues: player.clues.map((text) => ({ text })),
      supportNote: observer ? SUPPORT_NOTE : null,
    }
  }
}

function byJoin(a: Player, b: Player): number {
  return a.order - b.order
}

function sha(token: string): Buffer {
  return createHash('sha256').update(token).digest()
}

function sameHash(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

function ok<T>(code: string, data: T, message?: string): ActionOk<T> {
  return { ok: true, code, data, message }
}

function fail(error: string, message: string, code?: string, changed = false): ActionFail {
  return { ok: false, error, message, code, changed }
}
