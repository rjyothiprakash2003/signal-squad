import type { Clue, Puzzle } from './puzzles.js'

export function assignClues(puzzle: Puzzle, playerIds: string[]): Map<string, Clue[]> {
  const map = new Map<string, Clue[]>()
  for (const id of playerIds) map.set(id, [])
  if (playerIds.length < 2) return map
  const mid = Math.ceil(playerIds.length / 2)
  deal(puzzle.bundles[0], playerIds.slice(0, mid), map)
  deal(puzzle.bundles[1], playerIds.slice(mid), map)
  return map
}

function deal(clues: Clue[], group: string[], map: Map<string, Clue[]>) {
  if (group.length === 0 || clues.length === 0) return
  clues.forEach((clue, index) => {
    map.get(group[index % group.length])?.push(clue)
  })
  let cursor = 0
  for (const id of group) {
    const held = map.get(id)
    if (held && held.length === 0) {
      held.push(clues[cursor % clues.length])
      cursor += 1
    }
  }
}
