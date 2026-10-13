import type { Difficulty } from '../shared/types.js'

export interface Clue {
  id: string
  text: string
  holds: (digits: number[]) => boolean
}

export interface Puzzle {
  id: string
  title: string
  difficulty: Difficulty
  answer: string
  explanation: string
  bundles: [Clue[], Clue[]]
}

const ascending = (d: number[]) => d[0] < d[1] && d[1] < d[2] && d[2] < d[3]
const descending = (d: number[]) => d[0] > d[1] && d[1] > d[2] && d[2] > d[3]
const palindrome = (d: number[]) => d[0] === d[3] && d[1] === d[2]
const allOdd = (d: number[]) => d.every((n) => n % 2 === 1)
const allEven = (d: number[]) => d.every((n) => n % 2 === 0)
const sum = (d: number[]) => d[0] + d[1] + d[2] + d[3]

function gapAtLeast(min: number) {
  return (d: number[]) => {
    const gap = d[1] - d[0]
    return gap >= min && d[2] - d[1] === gap && d[3] - d[2] === gap
  }
}

export const campaign: Puzzle[] = [
  {
    id: 'lantern',
    title: 'Lantern',
    difficulty: 'easy',
    answer: '2424',
    explanation:
      'The repeated-block fragment says the code has the form ABAB, and every digit is even. The other fragment says it starts with 24 and the digits sum to 12. ABAB starting with 24 is 2424, and 2+4+2+4 = 12. No other code satisfies both fragments.',
    bundles: [
      [
        { id: 'l1', text: 'The first two digits are repeated as the last two digits.', holds: (d) => d[0] === d[2] && d[1] === d[3] },
        { id: 'l2', text: 'Every digit is even.', holds: allEven },
      ],
      [
        { id: 'l3', text: 'The first digit is 2 and the second digit is 4.', holds: (d) => d[0] === 2 && d[1] === 4 },
        { id: 'l4', text: 'The four digits sum to 12.', holds: (d) => sum(d) === 12 },
      ],
    ],
  },
  {
    id: 'harbor',
    title: 'Harbor',
    difficulty: 'easy',
    answer: '1357',
    explanation:
      'One fragment set says the digits are odd, strictly increasing, and separated by one constant gap of at least 2. That leaves 1357 and 3579. The other fragment says the code starts with 1 and ends with 7, which selects 1357.',
    bundles: [
      [
        { id: 'h1', text: 'All four digits are odd, and each digit is greater than the one before it.', holds: (d) => allOdd(d) && ascending(d) },
        { id: 'h2', text: 'The gap between consecutive digits is constant and at least 2.', holds: gapAtLeast(2) },
      ],
      [
        { id: 'h3', text: 'The first digit is 1.', holds: (d) => d[0] === 1 },
        { id: 'h4', text: 'The last digit is 7.', holds: (d) => d[3] === 7 },
      ],
    ],
  },
  {
    id: 'violet',
    title: 'Violet',
    difficulty: 'easy',
    answer: '5005',
    explanation:
      'A four-digit palindrome that starts with 5 has the form 5AA5. The other fragment says every digit is 0 or 5 and the second digit is 0. The only code that is both is 5005.',
    bundles: [
      [
        { id: 'v1', text: 'The code reads the same forwards and backwards.', holds: palindrome },
        { id: 'v2', text: 'The first digit is 5.', holds: (d) => d[0] === 5 },
      ],
      [
        { id: 'v3', text: 'Every digit is either 0 or 5.', holds: (d) => d.every((n) => n === 0 || n === 5) },
        { id: 'v4', text: 'The second digit is 0.', holds: (d) => d[1] === 0 },
      ],
    ],
  },
  {
    id: 'quartz',
    title: 'Quartz',
    difficulty: 'easy',
    answer: '4321',
    explanation:
      'Consecutive digits arranged from largest to smallest give 3210, 4321, 5432, and so on up to 9876. The largest digit is 4 and the smallest is 1, so the only match is 4321.',
    bundles: [
      [
        { id: 'q1', text: 'The digits are four consecutive integers arranged from largest to smallest.', holds: (d) => d[0] - d[1] === 1 && d[1] - d[2] === 1 && d[2] - d[3] === 1 },
        { id: 'q2', text: 'Every digit is different.', holds: (d) => new Set(d).size === 4 },
      ],
      [
        { id: 'q3', text: 'The largest digit is 4.', holds: (d) => Math.max(...d) === 4 },
        { id: 'q4', text: 'The smallest digit is 1.', holds: (d) => Math.min(...d) === 1 },
      ],
    ],
  },
  {
    id: 'kepler',
    title: 'Kepler',
    difficulty: 'easy',
    answer: '2244',
    explanation:
      'The code has the form AABB: the first two digits match, and the last two digits match. It also starts with 2, and the third digit is 4. That fixes the code as 2244.',
    bundles: [
      [
        { id: 'k1', text: 'The first digit equals the second digit.', holds: (d) => d[0] === d[1] },
        { id: 'k2', text: 'The third digit equals the fourth digit.', holds: (d) => d[2] === d[3] },
      ],
      [
        { id: 'k3', text: 'The first digit is 2.', holds: (d) => d[0] === 2 },
        { id: 'k4', text: 'The third digit is 4.', holds: (d) => d[2] === 4 },
      ],
    ],
  },
  {
    id: 'nimbus',
    title: 'Nimbus',
    difficulty: 'medium',
    answer: '2486',
    explanation:
      'The opening pair is 24 and the digits sum to 20, so the last two digits sum to 14. The closing pair is 86, and 8 is strictly larger than every other digit. 2486 is the only code that satisfies both fragments. 2+4+8+6 = 20.',
    bundles: [
      [
        { id: 'n1', text: 'The first two digits form the number 24.', holds: (d) => d[0] === 2 && d[1] === 4 },
        { id: 'n2', text: 'The four digits sum to 20.', holds: (d) => sum(d) === 20 },
      ],
      [
        { id: 'n3', text: 'The last two digits form the number 86.', holds: (d) => d[2] === 8 && d[3] === 6 },
        { id: 'n4', text: 'The third digit is strictly larger than each of the other digits.', holds: (d) => d[2] > d[0] && d[2] > d[1] && d[2] > d[3] },
      ],
    ],
  },
  {
    id: 'cobalt',
    title: 'Cobalt',
    difficulty: 'medium',
    answer: '3467',
    explanation:
      'The second digit is 4, so the first digit is one less: 3. The fourth digit is the sum of the first and second: 7. The third digit is twice the first: 6. The code is 3467.',
    bundles: [
      [
        { id: 'c1', text: 'The first digit is one less than the second digit.', holds: (d) => d[0] === d[1] - 1 },
        { id: 'c2', text: 'The fourth digit equals the first digit plus the second digit.', holds: (d) => d[3] === d[0] + d[1] },
      ],
      [
        { id: 'c3', text: 'The second digit is 4.', holds: (d) => d[1] === 4 },
        { id: 'c4', text: 'The third digit is twice the first digit.', holds: (d) => d[2] === d[0] * 2 },
      ],
    ],
  },
  {
    id: 'drift',
    title: 'Drift',
    difficulty: 'medium',
    answer: '3579',
    explanation:
      'A constant gap of at least 2 that ends in 9 gives 3579 (gap 2) or 0369 (gap 3). The digits must also be odd and strictly increasing, which removes 0369. The only remaining code is 3579.',
    bundles: [
      [
        { id: 'd1', text: 'All four digits are odd.', holds: allOdd },
        { id: 'd2', text: 'Each digit is greater than the one before it.', holds: ascending },
      ],
      [
        { id: 'd3', text: 'The gap between consecutive digits is constant and at least 2.', holds: gapAtLeast(2) },
        { id: 'd4', text: 'The last digit is 9.', holds: (d) => d[3] === 9 },
      ],
    ],
  },
  {
    id: 'marble',
    title: 'Marble',
    difficulty: 'medium',
    answer: '2112',
    explanation:
      'A four-digit palindrome has the form ABBA. The first digit is 2 and the second digit is 1, so the code is 2112.',
    bundles: [
      [
        { id: 'm1', text: 'The code reads the same forwards and backwards.', holds: palindrome },
        { id: 'm2', text: 'The first digit is greater than the second digit.', holds: (d) => d[0] > d[1] },
      ],
      [
        { id: 'm3', text: 'The first digit is 2.', holds: (d) => d[0] === 2 },
        { id: 'm4', text: 'The second digit is 1.', holds: (d) => d[1] === 1 },
      ],
    ],
  },
  {
    id: 'sable',
    title: 'Sable',
    difficulty: 'medium',
    answer: '5823',
    explanation:
      'The first digit is 5 and the first two digits sum to 13, so the second digit is 8. The first digit is 2 more than the fourth, so the fourth is 3. The last two digits sum to 5, so the third is 2. The second digit is also 6 more than the third. The code is 5823.',
    bundles: [
      [
        { id: 's1', text: 'The first digit plus the second digit equals 13.', holds: (d) => d[0] + d[1] === 13 },
        { id: 's2', text: 'The first digit is 5.', holds: (d) => d[0] === 5 },
      ],
      [
        { id: 's3', text: 'The third digit plus the fourth digit equals 5.', holds: (d) => d[2] + d[3] === 5 },
        { id: 's4', text: 'The second digit is 6 more than the third digit, and the first digit is 2 more than the fourth digit.', holds: (d) => d[1] === d[2] + 6 && d[0] === d[3] + 2 },
      ],
    ],
  },
  {
    id: 'vector',
    title: 'Vector',
    difficulty: 'hard',
    answer: '4392',
    explanation:
      'The first two digits multiply to 12 and the first is greater, so they are 43 or 62. The last two multiply to 18 and the third is greater, so they are 63 or 92. The only combination whose digits sum to 18 is 4392.',
    bundles: [
      [
        { id: 've1', text: 'The first two digits are non-zero and multiply to 12.', holds: (d) => d[0] >= 1 && d[1] >= 1 && d[0] * d[1] === 12 },
        { id: 've2', text: 'The first digit is greater than the second digit, and the four digits sum to 18.', holds: (d) => d[0] > d[1] && sum(d) === 18 },
      ],
      [
        { id: 've3', text: 'The last two digits are non-zero and multiply to 18.', holds: (d) => d[2] >= 1 && d[3] >= 1 && d[2] * d[3] === 18 },
        { id: 've4', text: 'The third digit is greater than the fourth digit.', holds: (d) => d[2] > d[3] },
      ],
    ],
  },
  {
    id: 'ember',
    title: 'Ember',
    difficulty: 'hard',
    answer: '6543',
    explanation:
      'The digits are strictly decreasing and the last digit is 3, so three different digits above 3 precede it. Their total with 3 is 18, so those three digits sum to 15. The smallest possible triple of strictly decreasing digits above 3 is 6, 5, and 4, which already sums to 15. The only code is 6543.',
    bundles: [
      [
        { id: 'e1', text: 'Each digit is smaller than the digit before it.', holds: descending },
        { id: 'e2', text: 'No digit repeats.', holds: (d) => new Set(d).size === 4 },
      ],
      [
        { id: 'e3', text: 'The four digits sum to 18.', holds: (d) => sum(d) === 18 },
        { id: 'e4', text: 'The last digit is 3.', holds: (d) => d[3] === 3 },
      ],
    ],
  },
  {
    id: 'cipher',
    title: 'Cipher',
    difficulty: 'hard',
    answer: '2357',
    explanation:
      'One fragment says the digits are exactly 2, 3, 5, and 7, each used once. There are 24 possible orders. The other fragment says the digits are strictly increasing and the last digit is greater than 5. The only increasing order of that set is 2357.',
    bundles: [
      [
        {
          id: 'ci1',
          text: 'The four digits are exactly 2, 3, 5, and 7, each used once, in an unknown order.',
          holds: (d) => new Set(d).size === 4 && d.every((n) => n === 2 || n === 3 || n === 5 || n === 7),
        },
        { id: 'ci2', text: 'The first digit is the smallest digit in the code.', holds: (d) => d[0] === Math.min(...d) },
      ],
      [
        { id: 'ci3', text: 'Each digit is greater than the one before it.', holds: ascending },
        { id: 'ci4', text: 'The last digit is greater than 5.', holds: (d) => d[3] > 5 },
      ],
    ],
  },
  {
    id: 'apex',
    title: 'Apex',
    difficulty: 'hard',
    answer: '9753',
    explanation:
      'The code starts with 9, ends with 3, and the digits sum to 24, so the middle two digits sum to 12. They are also odd and strictly decreasing, with both sitting between 9 and 3. The only pair is 7 then 5. The code is 9753.',
    bundles: [
      [
        { id: 'a1', text: 'Each digit is smaller than the digit before it.', holds: descending },
        { id: 'a2', text: 'Every digit is odd.', holds: allOdd },
      ],
      [
        { id: 'a3', text: 'The first digit is 9 and the last digit is 3.', holds: (d) => d[0] === 9 && d[3] === 3 },
        { id: 'a4', text: 'The four digits sum to 24.', holds: (d) => sum(d) === 24 },
      ],
    ],
  },
]

const byId = new Map(campaign.map((puzzle) => [puzzle.id, puzzle]))

export function puzzleById(id: string): Puzzle | undefined {
  return byId.get(id)
}

export function solutionsFor(clues: Clue[]): string[] {
  const found: string[] = []
  for (let n = 0; n < 10000; n += 1) {
    const digits = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10]
    if (clues.every((clue) => clue.holds(digits))) found.push(String(n).padStart(4, '0'))
  }
  return found
}
