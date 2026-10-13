import { readFileSync, existsSync } from 'node:fs'
import { DEFAULT_CONFIG, withConfig, type GameConfig } from '../shared/config.js'

export function loadEnvFile(file = '.env'): void {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a number from ${min} to ${max}.`)
  }
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GameConfig {
  return withConfig({
    roomTtlMs: integer(env, 'ROOM_TTL_MS', DEFAULT_CONFIG.roomTtlMs, 60_000, 24 * 60 * 60 * 1000),
    hostGraceMs: integer(env, 'HOST_GRACE_MS', DEFAULT_CONFIG.hostGraceMs, 0, 30 * 60 * 1000),
    disconnectRemoveMs: integer(env, 'DISCONNECT_REMOVE_MS', DEFAULT_CONFIG.disconnectRemoveMs, 1_000, 60 * 60 * 1000),
    emptyRoomMs: integer(env, 'EMPTY_ROOM_MS', DEFAULT_CONFIG.emptyRoomMs, 1_000, 60 * 60 * 1000),
    penaltyMs: integer(env, 'PENALTY_MS', DEFAULT_CONFIG.penaltyMs, 0, 120_000),
    roundMs: {
      easy: integer(env, 'ROUND_MS_EASY', DEFAULT_CONFIG.roundMs.easy, 1_000, 30 * 60 * 1000),
      medium: integer(env, 'ROUND_MS_MEDIUM', DEFAULT_CONFIG.roundMs.medium, 1_000, 30 * 60 * 1000),
      hard: integer(env, 'ROUND_MS_HARD', DEFAULT_CONFIG.roundMs.hard, 1_000, 30 * 60 * 1000),
    },
  })
}
