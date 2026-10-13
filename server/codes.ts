import { randomBytes } from 'node:crypto'

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(bytes: Uint8Array = randomBytes(5)): string {
  let out = ''
  for (let i = 0; i < 5; i += 1) {
    out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length]
  }
  return out
}
