# Testing

Run everything from the `game/` directory after `npm install`.

```bash
npm run typecheck
npm run lint
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Install the browser once before the end-to-end suite:

```bash
npx playwright install chromium
```

## What each suite covers

### Unit (`tests/unit/logic.test.ts`)

- Room-code alphabet and unbiased selection.
- Name, code, answer, and chat validation.
- Config loading, including invalid values and empty values.
- All 14 puzzles: both bundles together have one solution in 0000–9999; each bundle, and each single clue, has more than one; no player receives both bundles for squad sizes 2 through 6.
- Score formula, a loss scoring zero, and a first-try attempt bonus.
- Rate limiter window.
- Host-only start, private clues, score awarded once, replay awarding nothing.
- Deadline expiry rejecting a correct code with zero attempts and zero points.
- Five wrong codes ending the round, then a further submit rejected as already ended.
- A time penalty that crosses zero.
- A win on the fifth attempt with no attempt bonus.
- Immediate host transfer in the lobby, and grace-period transfer during a mission.
- Resume restoring clues, removal of a stale player, a late joiner as observer, orphaned clues going to the next joiner.
- Full room, duplicate name, unknown code, expiry, chat rate limit.

### Integration (`tests/integration/realtime.test.ts`)

Two real Socket.IO clients against one server:

- Create and join, shared membership, a non-host blocked from starting.
- Different private fragments. The public payload and one player's private view do not contain the other player's clue text or the answer.
- The same deadline on both clients.
- Chat in both directions, and no chat across rooms.
- Empty answer, a wrong answer, then two simultaneous correct submits. Exactly one success and one score.
- Next mission keeps the score.
- Invalid payloads and bad codes.
- Disconnect during a mission does not end it. Resume restores that player's clues.
- Leave removes the player and does not end the phase.
- `GET /api/rules` contains titles and difficulties, not answers or clue text.
- A forced server error returns `SERVER_ERROR`, and `/api/health` still responds.

### End to end (`tests/e2e/play.spec.ts`)

Two independent Chromium contexts:

1. Ada creates a room.
2. Bo joins with the room code.
3. Both see both names.
4. Both acknowledge the briefing and ready up. The host starts.
5. Ada's fragment matches bundle A and does not include bundle B. Bo's is the reverse.
6. They exchange chat.
7. The displayed countdown agrees within two seconds.
8. They submit a wrong code, then the real code.
9. Both screens show the same result and the same team score, awarded once.
10. The host starts Harbor. The score does not change.
11. Ada reloads and is still on Harbor with the same fragment.
12. Bo leaves. Ada's squad list no longer shows Bo.

A second test checks a 390×844 layout for horizontal overflow. A third test aborts the decorative hero image and checks that the page still works, then checks a bad room code and a one-character name.

## Latest executed results

These counts are from the local run during implementation, not from a skipped suite:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 20 passed, 0 failed, 0 skipped (2 files) |
| `npm run test:e2e` | 3 passed, 0 failed, 0 skipped |

Re-run them after you change the game. The table goes stale the moment the code changes.

## Manual checklist for two or more players

Use two browsers, or a browser and a private window, or two devices pointed at the same server.

- [ ] Create a room. The code is five characters and the share link opens the join form.
- [ ] A second player joins. Both lists show both names. No extra names appear.
- [ ] A duplicate name is rejected. A full room (seven players) is rejected. A bad code is rejected.
- [ ] Start stays disabled until two players are ready. A non-host has no start button.
- [ ] After start, the fragments differ and neither screen shows the answer.
- [ ] Chat from each player appears on the other screen with a name and a time.
- [ ] A wrong code spends an attempt on both screens and shortens the clock.
- [ ] The correct code shows the same result, explanation, and score on both screens.
- [ ] The host starts the next mission. The score does not jump a second time for the mission already solved.
- [ ] Refresh one player. The mission, role, and fragment return.
- [ ] One player leaves. The room stays usable for the other.
- [ ] On a phone-width window, the fragment, code entry, and chat are reachable, and the countdown stays on screen.

## Issues found and fixed

| Issue | Cause | Fix |
| --- | --- | --- |
| A sixth submit in the unit test returned a rate-limit error | The default submit cap is five per ten seconds, and the test sent six | The test raises the cap so it can observe the already-ended state |
| A duplicate-name assertion returned "room full" | The test filled every seat before checking the duplicate | The duplicate is asserted while a seat remains |
| End-to-end tests could not find the create form | The form's role is `form`, and the test asked for `region` | Locators use `getByRole('form')` |
| "Incorrect" matched two nodes | The live region and the chat line both contained the word | The assertion is scoped to the chat log |
| Leaving a player did not update a list the test could see | The squad list was only rendered in the lobby | The roster stays on screen during the mission and the results |
| First entry flashed "Reconnected." | The room page resumed a session it already held | Resume is skipped when that room is already loaded, and a successful resume does not raise a success banner |
| `npm start` depended on `cross-env` | That package is a devDependency and disappears in a production install | The start script sets `NODE_ENV` in the shell; the Docker image sets it in the environment |
