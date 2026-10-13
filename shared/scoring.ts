import type { GameConfig } from './config.js'
import { DEFAULT_CONFIG } from './config.js'
import type { Difficulty, ScoreBreakdown } from './types.js'

export function scoreMission(
  input: {
    won: boolean
    difficulty: Difficulty
    remainingMs: number
    attemptsUsed: number
    maxAttempts: number
  },
  config: GameConfig = DEFAULT_CONFIG,
): ScoreBreakdown {
  const rule = config.scoring[input.difficulty]
  const remainingSeconds = Math.max(0, Math.floor(input.remainingMs / 1000))
  const attemptsUsed = Math.max(0, Math.floor(input.attemptsUsed))
  const attemptsLeft = Math.max(0, input.maxAttempts - attemptsUsed)
  if (!input.won) {
    return {
      base: 0,
      timeBonus: 0,
      attemptBonus: 0,
      total: 0,
      remainingSeconds,
      attemptsUsed,
      attemptsLeft,
      difficulty: input.difficulty,
    }
  }
  const base = rule.base
  const timeBonus = remainingSeconds * rule.perSecond
  const attemptBonus = attemptsLeft * rule.perAttemptLeft
  return {
    base,
    timeBonus,
    attemptBonus,
    total: base + timeBonus + attemptBonus,
    remainingSeconds,
    attemptsUsed,
    attemptsLeft,
    difficulty: input.difficulty,
  }
}
