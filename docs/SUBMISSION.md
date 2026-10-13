# Submission summary

**Signal Squad: Decode Before Zero** is a cooperative browser puzzle for 2–6 players. Each player gets a private fragment. The squad chats, agrees on one four-digit code, and submits it before a shared countdown ends.

## What a reviewer can do

1. From `game/`, run `npm install` and `npm run dev`.
2. Open http://127.0.0.1:5173. Create a room.
3. Open a second browser or a private window on the same URL. Join with the room code.
4. Ready up, start, trade the fragments in chat, and transmit the code.
5. Confirm both screens show the same result and the same score.

No account is required. Joining uses a room code.

## Challenge checklist

| Requirement | Status |
| --- | --- |
| Two players, separate devices or browser sessions | Implemented and covered by the Playwright test with two contexts |
| Rules understandable without help | Landing page, first-run briefing, and How to play with a 1234 example |
| Public URL | Not deployed from this environment. No hosting credentials were available. Files for Render, Fly, and Docker are ready. |
| Join with a room code, no install, no registration | Implemented |
| Stable enough to demonstrate | Unit, integration, and end-to-end tests passed locally |

## Architecture in one paragraph

One Node process runs Express and Socket.IO. The server owns membership, the phase, the deadline, private fragments, answer checks, and scoring. Each socket receives only its own fragment. The client is React, built by Vite, and in production it is served by that same process. Rooms are in memory, which is enough for a single-instance demo and is lost on restart.

## Tests executed

- `npm test`: 20 passed, 0 failed, 0 skipped.
- `npm run test:e2e`: 3 passed, 0 failed, 0 skipped. The long test plays the two-player journey above, including a reload and a player leaving.
- Typecheck, lint, and `npm run build` passed.

## Privacy check

The integration test asserts that one player's snapshot does not contain the other player's fragment or the answer. The rules endpoint returns titles and difficulties only. Puzzle source is not imported by the client.

## Manual step still required for a public URL

Deploy the `game/` directory as a single Node instance using [DEPLOYMENT.md](DEPLOYMENT.md). Then play one full round on the resulting HTTPS URL from two devices. That URL is the public game address. This repository does not contain one.
