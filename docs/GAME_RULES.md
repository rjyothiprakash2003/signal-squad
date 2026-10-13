# Game rules

Signal Squad is a cooperative cipher mission for 2–6 players. Everyone shares one countdown and one answer. Nobody is given the whole transmission.

## How a round works

1. Join a room with a display name and a room code. No account is required.
2. Wait in the lobby until at least two agents are ready. The host starts the mission.
3. Read the private fragment on your screen. The server does not send you anyone else's fragment.
4. Tell the squad what your fragment says, using the room chat.
5. Combine the fragments. They describe exactly one four-digit code, from 0000 through 9999.
6. Transmit that code before the clock hits zero and before five attempts are used up.
7. You win the round by solving the code. You lose the round when time expires or the attempts run out.

Between missions the host can start the next mission, replay the one that just finished, or reset the campaign. Ready checks apply to the opening lobby. They are not repeated between missions.

## Worked example

This example is teaching material. It is not a campaign mission.

- North fragment: the digits are consecutive whole numbers in increasing order.
- South fragment: the first digit is 1.

The only four-digit code that satisfies both lines is **1234**.

## What you are told

Each mission has a public title, a public briefing, and two private bundles of fragments. Titles are codenames. They do not add constraints. The briefing tells you to trade fragments. It does not contain the solution.

With two players, the host receives bundle A and the other player receives bundle B. With three to six players, the first half of the squad (by join order) shares bundle A and the second half shares bundle B. A player is never given both bundles. If a group would otherwise leave someone with nothing, a fragment from that same bundle is repeated.

A player who joins while a mission is already running can chat and submit a code. They receive a fragment only if a player who left still had one that nobody else is holding.

## Clocks and attempts

| Difficulty | Clock | Missions |
| --- | --- | --- |
| Easy | 3:00 | 1–5 |
| Medium | 4:00 | 6–10 |
| Hard | 5:00 | 11–14 |

The server stores the deadline. Browsers display that deadline; they do not run an independent clock that can score a late answer.

- A wrong code spends one attempt and removes 15 seconds.
- The fifth wrong code ends the round immediately, before the time penalty is applied.
- If a time penalty reaches zero, the round is lost for time.
- A correct code submitted when the deadline has already passed does not score, and it does not spend an attempt.
- Two correct submissions at the same moment produce one win and one score.

## Scoring

Points are computed on the server when a mission is solved.

```
points = base + (seconds left × per second) + (unused attempts × per unused attempt)
```

| Difficulty | Base | Per second left | Per unused attempt |
| --- | ---: | ---: | ---: |
| Easy | 500 | 2 | 40 |
| Medium | 800 | 3 | 60 |
| Hard | 1200 | 4 | 80 |

The winning transmission counts as a used attempt. A first-try easy solve keeps four unused attempts. A loss scores 0. The team total never goes below zero. Solving the same mission again does not award points a second time. Resetting the campaign clears the score and the history.

The results screen shows the points for the round, the team total, attempts used, seconds left, and the arithmetic.

## Campaign

Missions are played in this order. The first three are the training set.

| # | Codenames | Difficulty |
| --- | --- | --- |
| 1 | Lantern | Easy |
| 2 | Harbor | Easy |
| 3 | Violet | Easy |
| 4 | Quartz | Easy |
| 5 | Kepler | Easy |
| 6 | Nimbus | Medium |
| 7 | Cobalt | Medium |
| 8 | Drift | Medium |
| 9 | Marble | Medium |
| 10 | Sable | Medium |
| 11 | Vector | Hard |
| 12 | Ember | Hard |
| 13 | Cipher | Hard |
| 14 | Apex | Hard |

Clearing mission 14 marks the campaign complete. Answers are intentionally omitted here so a player reading the rules is not handed the campaign.

## Leaving, refreshing, and the host

- Refresh the page on the same browser to reconnect, for up to ten minutes.
- In the lobby, if the host disconnects, the role passes immediately to the earliest connected player.
- During a mission, a disconnected host keeps the role for 45 seconds, so a refresh does not hand the role away. After that, it passes to the next connected player.
- Choosing Leave removes you at once. Your fragment can be given to a later joiner if nobody else is still holding it.
- An empty room is kept for 15 minutes. Every room expires three hours after it was created.

## Chat

Messages are visible only inside the room. A message can be 200 characters. Each player can send six messages in ten seconds. The game does not provide a private whisper channel; say your fragment in the squad chat on purpose.
