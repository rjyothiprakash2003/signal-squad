# Architecture

Signal Squad runs as one Node.js process. Express serves HTTP and, in production, the built React client. Socket.IO carries every match event. Rooms live in an in-memory `RoomStore`. There is no database.

This shape was chosen because the environment has Node, npm, and a browser, and it does not have a hosted realtime product or a database already configured. One process can demonstrate two devices joining the same room. It cannot be scaled out to several processes without replacing the room store.

## Request path

```
Browser (React)
  |  same origin: / and /socket.io
  |  development: Vite on :5173 proxies /api and /socket.io to :8787
  v
Express + Socket.IO
  |  RoomStore (memory)
  |  puzzles, assignment, scoring
  v
per-socket snapshot { public state, this player's private view }
```

Development does not serve the single-page app from Express. Production does, from `dist/client`, and only when `NODE_ENV=production`.

## Shared and secret code

`shared/` is safe for the browser: types, validation, the scoring formula, and the public rules. The client imports it.

`server/puzzles.ts` holds answers and the predicates that define each fragment. Only the server imports it. Tests brute-force every code from 0000 to 9999 and assert that both bundles together have one solution, and that neither bundle alone does.

## State machine

Phases: `WAITING`, `READY`, `IN_PROGRESS`, `WON`, `LOST`, `COMPLETED`.

- Create opens `WAITING`.
- Every connected player marking ready, with at least two players, moves the room to `READY`.
- Only the host can start, and only from `READY`. Start moves to `IN_PROGRESS` and sets the deadline.
- A correct in-time submission moves to `WON`, or to `COMPLETED` on the last mission.
- Five wrong codes move to `LOST` with reason `ATTEMPTS`.
- A deadline in the past, including a penalty that crosses zero, moves to `LOST` with reason `TIME`. The tick loop also enforces this.
- `next` is legal only from `WON`. `replay` is legal from `WON`, `LOST`, or `COMPLETED`. `reset` is a host action and is refused during `IN_PROGRESS`.

Transitions are checked on the server. A stale client cannot force a phase.

## Privacy

`broadcast` walks the sockets in the room and emits `game:update` to each one. It never emits one payload to the whole room that contains every fragment.

The public state includes phase, deadline, players, score, attempts, chat, and the mission title. It omits clue text and the answer until `WON`, `LOST`, or `COMPLETED`. After that, the reveal includes every fragment and the explanation.

The client ignores a snapshot whose version is older than the one it already applied.

## Authority

The server decides:

- who is in the room, who is host, and who may start or reset
- the deadline (`Date` on the server, sent as an absolute timestamp)
- which fragment a player receives
- whether a code is correct
- attempt counts and the 15-second penalty
- the score, and that a puzzle id is awarded only once
- which mission comes next

The client offsets its displayed clock with `serverNow` from the snapshot so a skewed laptop clock does not drift the countdown. Submitting is synchronous on the server. If `now >= deadline` at the moment of the check, a correct code does not score.

## Identity and reconnect

Creating or joining returns a 32-byte hex token. The server stores `SHA-256(token)` and compares with `timingSafeEqual`. The browser keeps `{ code, token, name }` in `sessionStorage` under `signalsquad.session`. That record is only for reconnecting. It is not the multiplayer sync path, and it is not put in the share URL. The share URL is `/room/CODE`.

A socket reconnect calls `room:resume`. If the token matches and the player has not been removed, the same fragment and phase come back. `UNAUTHORIZED`, `ROOM_NOT_FOUND`, and `ROOM_EXPIRED` clear the saved session.

A disconnect that is stale (the player already has a newer socket) is ignored.

## Host policy

Players have a monotonic join `order`.

- Explicit leave transfers the host immediately to the earliest remaining connected player, or the earliest remaining player if nobody is connected.
- A lobby disconnect transfers the host immediately.
- A disconnect during a mission keeps the host for `HOST_GRACE_MS` (45 seconds by default) so a refresh does not steal the role. The tick then gives it to the next connected player.
- A disconnected player is removed after `DISCONNECT_REMOVE_MS` (10 minutes).
- An empty room expires after `EMPTY_ROOM_MS` (15 minutes).
- A room expires `ROOM_TTL_MS` (3 hours) after creation. The timer is not refreshed by activity.

## Clue assignment

Players are sorted by `order`. The first half receives bundle 0 only. The second half receives bundle 1 only. Fragments are dealt round-robin inside the bundle. If that would leave someone in the group with nothing, a fragment from the same bundle is duplicated.

Leaving, or being removed after the timeout, orphans a fragment that nobody else still holds. A later joiner can pick those up. The deal is not reshuffled in the middle of a mission.

## Concurrency

Answer handling is synchronous inside the Node process. The first correct submission changes the phase. The second sees `WON` or `LOST` and is rejected as already ended. The awarded set records the puzzle id before any later call can score it again.

Chat and submit handlers also rate-limit per player. A per-socket event cap rejects floods. Create and failed-join limits are per IP.

## What this does not provide

Memory disappears when the process exits. Two instances do not share rooms. There is no audit log, no account system, and no encryption beyond HTTPS supplied by the host in front of the process. Rate limits and the content security policy are practical controls for a demo, not a claim that the service is hardened against a determined attacker.
