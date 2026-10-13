import { io, type Socket } from 'socket.io-client'
import { useSyncExternalStore } from 'react'
import type { AckResult, PrivateView, PublicState } from '../../../shared/types.js'

export interface Session {
  code: string
  token: string
  playerId: string
  name: string
}

interface Snapshot {
  status: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline'
  error: string | null
  flash: string | null
  flashTone: 'good' | 'bad' | null
  state: PublicState | null
  priv: PrivateView | null
  session: Session | null
  announcement: string
  chatLive: string
  redirectHome: boolean
}

const STORAGE_KEY = 'signalsquad.session'

const socket: Socket = io({
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  timeout: 8000,
})

let lastPhase: string | null = null
let lastChatId: string | null = null
let resumeLock: Promise<AckResult<{ name: string }>> | null = null

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (!parsed.code || !parsed.token || !parsed.playerId || !parsed.name) return null
    return { code: parsed.code, token: parsed.token, playerId: parsed.playerId, name: parsed.name }
  } catch {
    return null
  }
}

function saveSession(session: Session): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function clearStoredSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

let snapshot: Snapshot = {
  status: 'idle',
  error: null,
  flash: null,
  flashTone: null,
  state: null,
  priv: null,
  session: loadSession(),
  announcement: '',
  chatLive: '',
  redirectHome: false,
}

const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

function patch(partial: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...partial }
  emit()
}

function phaseLine(phase: string): string {
  if (phase === 'IN_PROGRESS') return 'Mission started. Read your private fragment.'
  if (phase === 'WON') return 'Mission successful.'
  if (phase === 'LOST') return 'Mission failed.'
  if (phase === 'COMPLETED') return 'Campaign complete.'
  if (phase === 'READY') return 'The squad is ready.'
  return ''
}

socket.on('connect', () => {
  const dropped = snapshot.status === 'reconnecting' || snapshot.status === 'offline'
  patch({ status: 'live', error: dropped ? null : snapshot.error })
  if (dropped && snapshot.session) void resume()
})

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') {
    patch({ status: 'idle' })
    return
  }
  patch({ status: snapshot.session ? 'reconnecting' : 'offline' })
})

socket.on('connect_error', () => {
  patch({
    status: 'offline',
    error: snapshot.error ?? 'Cannot reach mission control. Check that the server is running.',
  })
})

socket.on('game:update', (message: { state?: PublicState; private?: PrivateView }) => {
  if (!message?.state || typeof message.state.version !== 'number' || !message.private) return
  if (snapshot.state && message.state.code === snapshot.state.code && message.state.version < snapshot.state.version) return
  let announcement = snapshot.announcement
  let chatLive = snapshot.chatLive
  let flash = snapshot.flash
  let flashTone = snapshot.flashTone
  if (lastPhase && lastPhase !== message.state.phase) {
    announcement = phaseLine(message.state.phase) || announcement
    flash = null
    flashTone = null
  }
  lastPhase = message.state.phase
  const newest = message.state.chat[message.state.chat.length - 1]
  if (newest && newest.id !== lastChatId) {
    if (lastChatId && newest.playerId !== message.private.playerId) {
      chatLive = newest.system ? newest.text : `${newest.name}: ${newest.text}`
    }
    lastChatId = newest.id
  }
  patch({
    state: message.state,
    priv: message.private,
    status: 'live',
    error: null,
    announcement,
    chatLive,
    flash,
    flashTone,
  })
})

socket.on('room:expired', (message: { message?: string }) => {
  clearStoredSession()
  lastPhase = null
  lastChatId = null
  patch({
    session: null,
    state: null,
    priv: null,
    redirectHome: true,
    error: message?.message ?? 'This room has expired.',
    flash: null,
    flashTone: null,
  })
})

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Snapshot {
  return snapshot
}

export function useGame(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function clearRedirect(): void {
  if (snapshot.redirectHome) patch({ redirectHome: false })
}

async function ensureConnected(): Promise<void> {
  if (socket.connected) return
  patch({ status: 'connecting', error: null })
  socket.connect()
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Cannot reach mission control. Start the server and try again.'))
    }, 6000)
    const onConnect = () => {
      window.clearTimeout(timer)
      socket.off('connect_error', onError)
      resolve()
    }
    const onError = () => {
      window.clearTimeout(timer)
      socket.off('connect', onConnect)
      reject(new Error('Cannot reach mission control. Start the server and try again.'))
    }
    socket.once('connect', onConnect)
    socket.once('connect_error', onError)
  })
}

function emitAck<T>(event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Mission control did not respond. Check your connection.')), 8000)
    socket.emit(event, payload, (result: AckResult<T>) => {
      window.clearTimeout(timer)
      if (!result || typeof result !== 'object') {
        reject(new Error('Unexpected response from mission control.'))
        return
      }
      resolve(result)
    })
  })
}

async function run<T>(event: string, payload: unknown): Promise<AckResult<T>> {
  try {
    await ensureConnected()
    const result = await emitAck<T>(event, payload)
    if (!result.ok) {
      patch({ error: result.message, flash: null, flashTone: null })
      return result
    }
    const message = result.message ?? null
    const bad = message?.startsWith('Incorrect') || message?.startsWith('The clock') || message?.startsWith('No attempts')
    patch({
      error: null,
      flash: message,
      flashTone: message ? (bad ? 'bad' : 'good') : null,
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    patch({ error: message, flash: null, flashTone: null, status: socket.connected ? snapshot.status : 'offline' })
    return { ok: false, error: 'CLIENT', message }
  }
}

export async function createRoom(name: string): Promise<AckResult<Session>> {
  const result = await run<Session>('room:create', { name })
  if (result.ok) {
    const session = result.data
    saveSession(session)
    patch({ session })
  }
  return result
}

export async function joinRoom(code: string, name: string): Promise<AckResult<Session>> {
  const result = await run<Session>('room:join', { code, name })
  if (result.ok) {
    const session = result.data
    saveSession(session)
    patch({ session })
  }
  return result
}

export function resume(): Promise<AckResult<{ name: string }>> {
  if (resumeLock) return resumeLock
  const session = snapshot.session
  if (!session) return Promise.resolve({ ok: false, error: 'NO_SESSION', message: 'Join a room to play.' })
  resumeLock = run<{ name: string }>('room:resume', { code: session.code, token: session.token })
    .then((result) => {
      if (result.ok) patch({ flash: null, flashTone: null })
      if (!result.ok && (result.error === 'UNAUTHORIZED' || result.error === 'ROOM_NOT_FOUND' || result.error === 'ROOM_EXPIRED')) {
        clearStoredSession()
        lastPhase = null
        lastChatId = null
        patch({ session: null, state: null, priv: null, error: result.message })
      }
      return result
    })
    .finally(() => {
      resumeLock = null
    })
  return resumeLock
}

export function setReady(ready: boolean) {
  return run('room:ready', { ready })
}

export function startMission() {
  return run('room:start', {})
}

export function submitAnswer(answer: string) {
  return run<{ correct: boolean; ended: boolean }>('room:submit', { answer })
}

export function sendChat(text: string) {
  return run('room:chat', { text })
}

export function nextMission() {
  return run('room:next', {})
}

export function replayMission() {
  return run('room:replay', {})
}

export function resetCampaign() {
  return run('room:reset', {})
}

export async function leaveRoom(): Promise<AckResult<{ deleted: boolean }>> {
  const result = await run<{ deleted: boolean }>('room:leave', {})
  if (result.ok) {
    clearStoredSession()
    lastPhase = null
    lastChatId = null
    patch({ session: null, state: null, priv: null, flash: 'You left the room.', flashTone: 'good', error: null })
  }
  return result
}

export function connectionLabel(status: Snapshot['status']): string {
  if (status === 'live') return 'Live'
  if (status === 'reconnecting') return 'Reconnecting'
  if (status === 'connecting') return 'Connecting'
  if (status === 'offline') return 'Offline'
  return 'Idle'
}
