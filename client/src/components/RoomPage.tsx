import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { parseAnswer, parseChat, parseName } from '../../../shared/validate.js'
import {
  connectionLabel,
  joinRoom,
  leaveRoom,
  nextMission,
  replayMission,
  resetCampaign,
  resume,
  sendChat,
  setReady,
  startMission,
  submitAnswer,
  useGame,
} from '../lib/gameStore'
import type { PublicState } from '../../../shared/types.js'
import { RulesContent } from './RulesContent'
import { Art, Banner, ConfirmDialog, Countdown, LogoMark } from './ui'

export function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const game = useGame()
  const normalized = code.toUpperCase().replace(/[\s-]/g, '')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (game.session?.code !== normalized) return
    if (game.state?.code === normalized && game.priv?.playerId === game.session.playerId) return
    void resume()
  }, [normalized, game.session?.code, game.session?.playerId, game.state?.code, game.priv?.playerId])

  useEffect(() => {
    if (game.redirectHome) navigate('/')
  }, [game.redirectHome, navigate])

  async function confirmLeave() {
    setLeaveOpen(false)
    const result = await leaveRoom()
    if (result.ok) navigate('/')
  }

  const inRoom = game.session?.code === normalized && game.state?.code === normalized && !!game.priv
  const connecting = game.session?.code === normalized && !inRoom
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          <LogoMark />
          <span>Signal Squad</span>
        </Link>
        <div className="header-tools">
          {inRoom && game.state && (
            <>
              <span className="score" data-testid="team-score">Score {game.state.teamScore}</span>
              <button type="button" className="btn ghost" onClick={() => setLeaveOpen(true)}>Leave room</button>
            </>
          )}
          <span className={`pill status-${game.status}`}>{connectionLabel(game.status)}</span>
        </div>
      </header>
      <main id="content" className="page room-page">
        <div className="sr-only" aria-live="assertive">{game.announcement}</div>
        <div className="sr-only" aria-live="polite">{game.chatLive}</div>
        {connecting && <p className="banner banner-info" role="status">Connecting to the room…</p>}
        {!game.session || game.session.code !== normalized ? <JoinPanel code={normalized} /> : null}
        {inRoom && <RoomBody onReset={() => setResetOpen(true)} />}
      </main>
      <ConfirmDialog
        open={leaveOpen}
        title="Leave the squad?"
        body="You will drop out of this room. If you are the host, command passes to the next agent."
        confirmLabel="Leave"
        danger
        onConfirm={() => void confirmLeave()}
        onCancel={() => setLeaveOpen(false)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Reset the campaign?"
        body="Team score and mission progress return to zero. This cannot be undone."
        confirmLabel="Reset campaign"
        danger
        onConfirm={() => { setResetOpen(false); void resetCampaign() }}
        onCancel={() => setResetOpen(false)}
      />
    </>
  )
}

function JoinPanel({ code }: { code: string }) {
  const game = useGame()
  const [name, setName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const error = localError ?? game.error

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseName(name)
    if (!parsed.ok) {
      setLocalError(parsed.message)
      return
    }
    setLocalError(null)
    setPending(true)
    await joinRoom(code, parsed.name)
    setPending(false)
  }

  return (
    <form className="card narrow" aria-label="Join this room" onSubmit={onSubmit}>
      <p className="eyebrow">Room</p>
      <h1 data-testid="room-code">{code}</h1>
      <label htmlFor="room-join-name">Agent name</label>
      <input id="room-join-name" maxLength={16} value={name} onChange={(event) => setName(event.target.value)} required />
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Joining…' : 'Join room'}</button>
      {error && <Banner tone="error">{error}</Banner>}
      <p><Link to="/how-to-play">Read the briefing</Link></p>
    </form>
  )
}

function RoomBody({ onReset }: { onReset: () => void }) {
  const game = useGame()
  const state = game.state
  const priv = game.priv
  if (!state || !priv) return null
  const results = state.phase === 'WON' || state.phase === 'LOST' || state.phase === 'COMPLETED'
  return (
    <>
      <RoomIntro state={state} />
      {game.error && <Banner tone="error">{game.error}</Banner>}
      {game.flash && <Banner tone={game.flashTone === 'bad' ? 'error' : 'good'}>{game.flash}</Banner>}
      {state.phase === 'WAITING' || state.phase === 'READY' ? <Lobby /> : null}
      {state.phase === 'IN_PROGRESS' ? <Mission /> : null}
      {results ? <Results onReset={onReset} /> : null}
    </>
  )
}

function RoomIntro({ state }: { state: PublicState }) {
  const [copied, setCopied] = useState('')
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      setCopied(label)
    }
  }
  const shareUrl = `${window.location.origin}/room/${state.code}`
  return (
    <div className="room-intro">
      <div>
        <p className="eyebrow">Mission {state.missionNumber} of {state.missionCount} · {state.difficulty}</p>
        <h1 data-testid="mission-title">{state.title}</h1>
        <p>Trade private fragments in chat. Together they fit exactly one four-digit code.</p>
      </div>
      <div className="code-box">
        <p>Room code</p>
        <strong data-testid="room-code">{state.code}</strong>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => void copy(state.code, 'Code copied.')}>Copy code</button>
          <button type="button" className="btn ghost" onClick={() => void copy(shareUrl, 'Link copied.')}>Copy link</button>
        </div>
        {copied && <p role="status">{copied}</p>}
      </div>
      <div className="pips" aria-hidden="true">
        {Array.from({ length: state.missionCount }, (_, index) => (
          <span key={index} className={index + 1 < state.missionNumber ? 'done' : index + 1 === state.missionNumber ? 'now' : ''} />
        ))}
      </div>
      <ul className="player-list roster" data-testid="player-list">
        {state.players.map((player) => (
          <li key={player.id}>
            <span>{player.name}</span>
            <span className="tags">
              {player.isHost && <em>Host</em>}
              <em className={player.connected ? 'ok' : 'bad'}>{player.connected ? 'Online' : 'Offline'}</em>
              {(state.phase === 'WAITING' || state.phase === 'READY') && (
                <em className={player.ready ? 'ok' : ''}>{player.ready ? 'Ready' : 'Not ready'}</em>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Lobby() {
  const game = useGame()
  const state = game.state
  const priv = game.priv
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const dialogEl = dialog.current
    if (!dialogEl || sessionStorage.getItem('signalsquad.briefed') === '1') return
    if (!dialogEl.open) dialogEl.showModal()
  }, [])
  if (!state || !priv) return null
  const connected = state.players.filter((player) => player.connected)
  const waiting = connected.filter((player) => !player.ready).map((player) => player.name)
  const me = state.players.find((player) => player.id === priv.playerId)
  let startHelp = 'Every connected agent taps Ready, then the host starts.'
  if (connected.length < state.rules.minPlayers) startHelp = `Waiting for agents. You need at least ${state.rules.minPlayers}.`
  else if (state.phase !== 'READY') startHelp = `Still waiting on ${waiting.join(', ') || 'the squad'}.`
  return (
    <div className="room-grid">
      <section className="card">
        <h2>Squad</h2>
        {connected.length < state.rules.minPlayers && (
          <Banner tone="info">Waiting for agents. Share the room code — you need at least two players.</Banner>
        )}
        <button
          type="button"
          className="btn secondary"
          aria-pressed={me?.ready ?? false}
          onClick={() => void setReady(!(me?.ready ?? false))}
        >
          {me?.ready ? 'Ready' : 'Ready up'}
        </button>
        {priv.isHost ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={state.phase !== 'READY' || pending}
              aria-describedby="start-help"
              onClick={() => {
                setPending(true)
                void startMission().finally(() => setPending(false))
              }}
            >
              {pending ? 'Starting…' : 'Start mission'}
            </button>
            <p id="start-help">{startHelp}</p>
          </>
        ) : (
          <p>Waiting for {state.players.find((player) => player.isHost)?.name ?? 'the host'} to start.</p>
        )}
      </section>
      <Chat />
      <dialog
        ref={dialog}
        className="modal wide"
        aria-labelledby="brief-title"
        onCancel={(event) => event.preventDefault()}
      >
        <h2 id="brief-title">Briefing</h2>
        <RulesContent compact />
        <button
          type="button"
          className="btn"
          onClick={() => {
            sessionStorage.setItem('signalsquad.briefed', '1')
            dialog.current?.close()
          }}
        >
          I understand
        </button>
      </dialog>
    </div>
  )
}

function Mission() {
  const game = useGame()
  const state = game.state
  const priv = game.priv
  const [tab, setTab] = useState<'clues' | 'transmit' | 'chat'>('clues')
  const [answer, setAnswer] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (!state || !priv) return null
  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseAnswer(answer)
    if (!parsed.ok) {
      setLocalError(parsed.message)
      return
    }
    setLocalError(null)
    setPending(true)
    const result = await submitAnswer(parsed.answer)
    setPending(false)
    if (result.ok && result.data.correct) setAnswer('')
    if (result.ok && !result.data.correct && !result.data.ended) setAnswer('')
  }
  const attemptsLeft = state.maxAttempts - state.attemptsUsed
  return (
    <>
      <Countdown deadline={state.deadline} serverNow={state.serverNow} durationMs={state.durationMs} />
      <div className="mobile-tabs" role="tablist" aria-label="Mission panels">
        {(['clues', 'transmit', 'chat'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'on' : ''} onClick={() => setTab(item)}>
            {item === 'clues' ? 'Fragment' : item === 'transmit' ? 'Code' : 'Chat'}
          </button>
        ))}
      </div>
      <div className="room-grid">
      <section className={`pane ${tab === 'transmit' ? 'active' : ''}`}>
        <p className="attempt-line" data-testid="attempts">{attemptsLeft} attempts left · wrong code costs {state.rules.penaltySeconds}s</p>
        <div className="pips attempts" aria-hidden="true">
          {Array.from({ length: state.maxAttempts }, (_, index) => (
            <span key={index} className={index < state.attemptsUsed ? 'spent' : 'now'} />
          ))}
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor="answer">Four-digit code</label>
          <input
            id="answer"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            pattern="\d{4}"
            value={answer}
            onChange={(event) => setAnswer(event.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={!priv.canSubmit || pending}
          />
          <button className="btn" type="submit" disabled={!priv.canSubmit || pending}>
            {pending ? 'Sending…' : 'Transmit code'}
          </button>
        </form>
        {localError && <Banner tone="error">{localError}</Banner>}
      </section>
        <div className="side">
        <section className={`card pane ${tab === 'clues' ? 'active' : ''}`} data-testid="clue-panel">
          <h2><img src="/assets/signal-icons/lock.svg" alt="" onError={(event) => { event.currentTarget.hidden = true }} /> Your fragment</h2>
          {priv.clues.length > 0 ? (
            <ul>{priv.clues.map((clue) => <li key={clue.text}>{clue.text}</li>)}</ul>
          ) : (
            <p>{priv.supportNote ?? 'No fragment was issued to you.'}</p>
          )}
          <p className="fine">Say this in chat. Do not assume the other agents can see it.</p>
        </section>
        <div className={`pane ${tab === 'chat' ? 'active' : ''}`}><Chat /></div>
      </div>
    </div>
    </>
  )
}

function Results({ onReset }: { onReset: () => void }) {
  const game = useGame()
  const state = game.state
  const priv = game.priv
  const [pending, setPending] = useState<string | null>(null)
  if (!state || !priv || !state.reveal) return null
  const reveal = state.reveal
  const won = state.phase === 'WON' || state.phase === 'COMPLETED'
  async function act(name: string, run: () => Promise<unknown>) {
    setPending(name)
    await run()
    setPending(null)
  }
  return (
    <div className="results" data-testid="result">
      <Art
        src={won ? '/assets/mission-illustrations/success.jpg' : '/assets/mission-illustrations/failure.jpg'}
        alt={won ? 'A glowing radar ring locked around a check mark.' : 'A cracked countdown ring fading from amber to red.'}
        className="result-art"
      />
      <p className={`outcome outcome-${won ? 'good' : 'bad'}`}>{won ? 'Signal locked' : 'Signal lost'}</p>
      <h2>{state.phase === 'COMPLETED' ? 'Campaign complete' : won ? 'The code was correct' : 'The mission failed'}</h2>
      <p className="answer-reveal">Code <strong>{reveal.answer}</strong></p>
      <dl className="stats">
        <div><dt>Points this round</dt><dd>{reveal.scoreAwarded}</dd></div>
        <div><dt>Team score</dt><dd>{state.teamScore}</dd></div>
        <div><dt>Attempts used</dt><dd>{reveal.breakdown.attemptsUsed}</dd></div>
        <div><dt>Seconds left</dt><dd>{reveal.breakdown.remainingSeconds}</dd></div>
      </dl>
      <details>
        <summary>How these points were calculated</summary>
        {reveal.alreadyAwarded ? (
          <p>This mission was already scored. Replaying it does not add points again.</p>
        ) : won ? (
          <p>
            {reveal.breakdown.base} base + {reveal.breakdown.timeBonus} for time left + {reveal.breakdown.attemptBonus} for unused attempts = {reveal.breakdown.total}.
          </p>
        ) : (
          <p>A failed mission scores zero. Replay it to earn the points, or the host can reset the campaign.</p>
        )}
      </details>
      <h3>Debrief</h3>
      <p>{reveal.explanation}</p>
      <ul>{reveal.clues.map((clue) => <li key={clue.text}>{clue.text}</li>)}</ul>
      {state.history.length > 0 && (
        <>
          <h3>Mission history</h3>
          <ul className="history">
            {state.history.map((entry, index) => (
              <li key={`${entry.missionNumber}-${index}`}>
                {entry.title} · {entry.outcome === 'WON' ? 'Won' : 'Lost'} · {entry.scoreAwarded} pts · {entry.attemptsUsed} attempts
              </li>
            ))}
          </ul>
        </>
      )}
      {priv.isHost ? (
        <div className="actions">
          {state.phase === 'WON' && (
            <button type="button" className="btn" disabled={pending !== null} onClick={() => void act('next', nextMission)}>
              {pending === 'next' ? 'Starting…' : 'Next mission'}
            </button>
          )}
          <button type="button" className="btn secondary" disabled={pending !== null} onClick={() => void act('replay', replayMission)}>
            {pending === 'replay' ? 'Starting…' : 'Replay mission'}
          </button>
          <button type="button" className="btn ghost" onClick={onReset}>Reset campaign</button>
        </div>
      ) : (
        <p>Waiting for the host to replay or advance.</p>
      )}
      <Chat />
    </div>
  )
}

function Chat() {
  const game = useGame()
  const state = game.state
  const [text, setText] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [state?.chat.length])
  if (!state) return null
  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseChat(text, state?.rules.chatMaxLen ?? 200)
    if (!parsed.ok) {
      setLocalError(parsed.message)
      return
    }
    setLocalError(null)
    setPending(true)
    const result = await sendChat(parsed.text)
    setPending(false)
    if (result.ok) setText('')
  }
  return (
    <section className="card chat">
      <h2><img src="/assets/signal-icons/chat.svg" alt="" onError={(event) => { event.currentTarget.hidden = true }} /> Squad chat</h2>
      <div className="chat-log" ref={list} data-testid="chat-log">
        {state.chat.length === 0 && <p>No transmissions yet. Share your private fragment with the squad.</p>}
        {state.chat.map((message) => (
          <article key={message.id} className={message.system ? 'system' : ''}>
            <header>
              <strong>{message.name}</strong>
              <time dateTime={new Date(message.at).toISOString()}>
                {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </header>
            <p>{message.text}</p>
          </article>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <label htmlFor="chat-text">Message the squad</label>
        <div className="chat-row">
          <input
            id="chat-text"
            maxLength={state.rules.chatMaxLen}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button className="btn" type="submit" disabled={pending}>Send</button>
        </div>
        <p className="fine">{state.rules.chatMaxLen - text.length} characters left</p>
      </form>
      {localError && <Banner tone="error">{localError}</Banner>}
    </section>
  )
}
