import type { GameConfig } from './config.js'
import { DEFAULT_CONFIG } from './config.js'

const NAME_RE = /^[A-Za-z0-9]+(?:[ '-][A-Za-z0-9]+)*$/

export function parseName(raw: unknown, config: GameConfig = DEFAULT_CONFIG): { ok: true; name: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a name.' }
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < config.nameMin) return { ok: false, message: `Name must be at least ${config.nameMin} characters.` }
  if (name.length > config.nameMax) return { ok: false, message: `Name must be ${config.nameMax} characters or fewer.` }
  if (!NAME_RE.test(name)) return { ok: false, message: 'Use letters, numbers, spaces, apostrophes, or hyphens.' }
  return { ok: true, name }
}

export function parseCode(raw: unknown, length = DEFAULT_CONFIG.codeLength): { ok: true; code: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a room code.' }
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '')
  const re = new RegExp(`^[A-HJ-NP-Z2-9]{${length}}$`)
  if (!re.test(code)) {
    return { ok: false, message: `Room codes are ${length} characters and do not use I, O, 0, or 1.` }
  }
  return { ok: true, code }
}

export function parseAnswer(raw: unknown): { ok: true; answer: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a four-digit code.' }
  const answer = raw.trim()
  if (!answer) return { ok: false, message: 'Enter a four-digit code.' }
  if (!/^\d{4}$/.test(answer)) return { ok: false, message: 'The code must be exactly four digits (0–9).' }
  return { ok: true, answer }
}

export function parseChat(
  raw: unknown,
  maxLen = DEFAULT_CONFIG.chatMaxLen,
): { ok: true; text: string } | { ok: false; error: string; message: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'INVALID_PAYLOAD', message: 'Message must be text.' }
  const text = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!text) return { ok: false, error: 'EMPTY_MESSAGE', message: 'Message is empty.' }
  if (text.length > maxLen) return { ok: false, error: 'MESSAGE_TOO_LONG', message: `Messages are limited to ${maxLen} characters.` }
  return { ok: true, text }
}

export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}
