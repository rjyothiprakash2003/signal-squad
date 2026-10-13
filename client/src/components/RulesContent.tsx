import { useEffect, useState } from 'react'
import type { Difficulty, RulesView } from '../../../shared/types.js'

interface RulesResponse extends RulesView {
  campaign?: { number: number; title: string; difficulty: Difficulty }[]
}

const STEPS = [
  'Join a room with a name and a room code. No account is required.',
  'Wait in the lobby until at least two agents are ready, then the host starts the mission.',
  'Read the private fragment that only you can see.',
  'Tell the other agents what your fragment says, using the squad chat.',
  'Combine every fragment. Together they describe exactly one four-digit code.',
  'Transmit that code before the clock hits zero and before the squad runs out of attempts.',
  'You win the round by solving the code. The round is lost when time expires or the attempts run out.',
]

export function RulesContent({ compact = false }: { compact?: boolean }) {
  const [rules, setRules] = useState<RulesResponse | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/rules', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setRules(body))
      .catch(() => setRules(null))
    return () => controller.abort()
  }, [])

  return (
    <div className="rules">
      <ol className="steps">
        {STEPS.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {!compact && (
        <>
          <section>
            <h2>Example</h2>
            <p>This practice signal is not one of the live missions. The answer is <strong>1234</strong>.</p>
            <div className="example-grid">
              <article>
                <h3>North’s fragment</h3>
                <p>The digits are consecutive whole numbers in increasing order.</p>
              </article>
              <article>
                <h3>South’s fragment</h3>
                <p>The first digit is 1.</p>
              </article>
            </div>
            <p>
              North alone still has several codes: 0123, 1234, 2345, and so on. South alone only knows that the code starts with 1.
              Together there is one fit: 1234. Neither agent should transmit until both fragments have been said out loud in chat.
            </p>
          </section>
          <section>
            <h2>Clock, attempts, and score</h2>
            {rules ? (
              <>
                <p>
                  Easy missions last {rules.roundSeconds.easy / 60} minutes, medium {rules.roundSeconds.medium / 60} minutes,
                  and hard {rules.roundSeconds.hard / 60} minutes. The squad gets {rules.maxAttempts} attempts.
                  A wrong code removes {rules.penaltySeconds} seconds and one attempt. If the penalty reaches zero, the mission fails.
                </p>
                <table>
                  <caption>How a win is scored. A loss scores zero. Each mission pays out once.</caption>
                  <thead>
                    <tr>
                      <th>Difficulty</th>
                      <th>Base</th>
                      <th>Each second left</th>
                      <th>Each unused attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
                      <tr key={difficulty}>
                        <th scope="row">{difficulty}</th>
                        <td>{rules.scoring[difficulty].base}</td>
                        <td>+{rules.scoring[difficulty].perSecond}</td>
                        <td>+{rules.scoring[difficulty].perAttemptLeft}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  The winning transmission counts as an attempt, so a first-try clear on Easy keeps {rules.maxAttempts - 1} unused attempts.
                  Points cannot be changed from the browser. The server is the only scorekeeper.
                </p>
              </>
            ) : (
              <p>Open a room to see the exact clock and scoring rules for this server.</p>
            )}
          </section>
          <section>
            <h2>Connection and the host</h2>
            <p>
              Refreshing this device reconnects you with the same fragments.
              If the host’s link drops during a mission, command passes to the next connected agent after {rules ? `${rules.hostGraceSeconds} seconds` : 'a short grace period'}.
              In the lobby, command passes as soon as the host disconnects.
              An agent who stays offline for {rules ? Math.round(rules.reconnectSeconds / 60) : 10} minutes is removed, and a new agent can pick up their fragment.
            </p>
            <p>The first {rules?.trainingMissions ?? 3} missions are Easy. Later missions get harder. Only the host can start, replay, or advance.</p>
          </section>
        </>
      )}
      {compact && (
        <div className="example-grid">
          <article>
            <h3>Example · North</h3>
            <p>The digits are consecutive whole numbers in increasing order.</p>
          </article>
          <article>
            <h3>Example · South</h3>
            <p>The first digit is 1. Together the only code is 1234.</p>
          </article>
        </div>
      )}
    </div>
  )
}
