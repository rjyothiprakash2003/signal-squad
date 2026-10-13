import type { Difficulty, RulesView, ScoreRule } from './types.js'

export interface GameConfig {
  minPlayers: number
  maxPlayers: number
  maxAttempts: number
  penaltyMs: number
  roomTtlMs: number
  hostGraceMs: number
  disconnectRemoveMs: number
  emptyRoomMs: number
  chatMaxLen: number
  nameMin: number
  nameMax: number
  codeLength: number
  chatLimit: number
  chatWindowMs: number
  submitLimit: number
  submitWindowMs: number
  trainingMissions: number
  roundMs: Record<Difficulty, number>
  scoring: Record<Difficulty, ScoreRule>
}

export const DEFAULT_CONFIG: GameConfig = {
  minPlayers: 2,
  maxPlayers: 6,
  maxAttempts: 5,
  penaltyMs: 15_000,
  roomTtlMs: 3 * 60 * 60 * 1000,
  hostGraceMs: 45_000,
  disconnectRemoveMs: 10 * 60 * 1000,
  emptyRoomMs: 15 * 60 * 1000,
  chatMaxLen: 200,
  nameMin: 2,
  nameMax: 16,
  codeLength: 5,
  chatLimit: 6,
  chatWindowMs: 10_000,
  submitLimit: 5,
  submitWindowMs: 10_000,
  trainingMissions: 3,
  roundMs: {
    easy: 180_000,
    medium: 240_000,
    hard: 300_000,
  },
  scoring: {
    easy: { base: 500, perSecond: 2, perAttemptLeft: 40 },
    medium: { base: 800, perSecond: 3, perAttemptLeft: 60 },
    hard: { base: 1200, perSecond: 4, perAttemptLeft: 80 },
  },
}

export function withConfig(partial: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    roundMs: { ...DEFAULT_CONFIG.roundMs, ...partial.roundMs },
    scoring: { ...DEFAULT_CONFIG.scoring, ...partial.scoring },
  }
}

export function rulesView(config: GameConfig, missionCount: number): RulesView {
  return {
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    maxAttempts: config.maxAttempts,
    penaltySeconds: Math.round(config.penaltyMs / 1000),
    reconnectSeconds: Math.round(config.disconnectRemoveMs / 1000),
    hostGraceSeconds: Math.round(config.hostGraceMs / 1000),
    roundSeconds: {
      easy: Math.round(config.roundMs.easy / 1000),
      medium: Math.round(config.roundMs.medium / 1000),
      hard: Math.round(config.roundMs.hard / 1000),
    },
    scoring: config.scoring,
    chatMaxLen: config.chatMaxLen,
    missionCount,
    trainingMissions: config.trainingMissions,
  }
}
