export type Phase = 'WAITING' | 'READY' | 'IN_PROGRESS' | 'WON' | 'LOST' | 'COMPLETED'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type EndReason = 'SOLVED' | 'TIME' | 'ATTEMPTS'

export interface ScoreRule {
  base: number
  perSecond: number
  perAttemptLeft: number
}

export interface ScoreBreakdown {
  base: number
  timeBonus: number
  attemptBonus: number
  total: number
  remainingSeconds: number
  attemptsUsed: number
  attemptsLeft: number
  difficulty: Difficulty
}

export interface PublicPlayer {
  id: string
  name: string
  ready: boolean
  connected: boolean
  isHost: boolean
}

export interface ChatMessage {
  id: string
  playerId: string | null
  name: string
  text: string
  at: number
  system: boolean
}

export interface MissionHistoryEntry {
  missionNumber: number
  title: string
  difficulty: Difficulty
  outcome: 'WON' | 'LOST'
  scoreAwarded: number
  attemptsUsed: number
  elapsedSeconds: number
  remainingSeconds: number
}

export interface RulesView {
  minPlayers: number
  maxPlayers: number
  maxAttempts: number
  penaltySeconds: number
  reconnectSeconds: number
  hostGraceSeconds: number
  roundSeconds: Record<Difficulty, number>
  scoring: Record<Difficulty, ScoreRule>
  chatMaxLen: number
  missionCount: number
  trainingMissions: number
}

export interface RevealState {
  answer: string
  explanation: string
  clues: { text: string }[]
  breakdown: ScoreBreakdown
  scoreAwarded: number
  alreadyAwarded: boolean
}

export interface PublicState {
  code: string
  phase: Phase
  version: number
  serverNow: number
  expiresAt: number
  hostId: string
  players: PublicPlayer[]
  missionNumber: number
  missionCount: number
  title: string | null
  difficulty: Difficulty | null
  durationMs: number | null
  deadline: number | null
  startedAt: number | null
  attemptsUsed: number
  maxAttempts: number
  teamScore: number
  endReason: EndReason | null
  history: MissionHistoryEntry[]
  chat: ChatMessage[]
  reveal: RevealState | null
  rules: RulesView
}

export interface PrivateView {
  playerId: string
  isHost: boolean
  observer: boolean
  canSubmit: boolean
  clues: { text: string }[]
  supportNote: string | null
}

export interface GameUpdate {
  state: PublicState
  private: PrivateView
}

export type AckResult<T = Record<string, never>> =
  | { ok: true; message?: string; data: T }
  | { ok: false; error: string; message: string }
