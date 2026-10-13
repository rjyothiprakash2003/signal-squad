import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { parseCode, parseName } from '../../../shared/validate.js'
import { clearRedirect, connectionLabel, createRoom, joinRoom, useGame } from '../lib/gameStore'
import { RulesContent } from './RulesContent'
import { Art, Banner, LogoMark } from './ui'

export function Landing({ missing = false }: { missing?: boolean }) {
  const navigate = useNavigate()
  const game = useGame()
  const [createName, setCreateName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'join' | null>(null)

  useEffect(() => {
    clearRedirect()
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    const name = parseName(createName)
    if (!name.ok) {
      setLocalError(name.message)
      return
    }
    setLocalError(null)
    setPending('create')
    const result = await createRoom(name.name)
    setPending(null)
    if (result.ok) navigate(`/room/${result.data.code}`)
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault()
    const name = parseName(joinName)
    if (!name.ok) {
      setLocalError(name.message)
      return
    }
    const room = parseCode(code)
    if (!room.ok) {
      setLocalError(room.message)
      return
    }
    setLocalError(null)
    setPending('join')
    const result = await joinRoom(room.code, name.name)
    setPending(null)
    if (result.ok) navigate(`/room/${result.data.code}`)
  }

  const error = localError ?? game.error

  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          <LogoMark />
          <span>Signal Squad</span>
        </Link>
        <nav>
          <Link to="/how-to-play">How to play</Link>
          <span className={`pill status-${game.status}`}>{connectionLabel(game.status)}</span>
        </nav>
      </header>
      <main id="content" className="landing">
        {missing && <Banner tone="error">That page does not exist.</Banner>}
        <section className="hero">
          <div>
            <p className="eyebrow">Cooperative cipher mission · 2–6 players</p>
            <h1>Decode before zero.</h1>
            <p className="lede">
              You are agents on separate devices, each holding a private fragment of an encrypted transmission.
              Talk it through, build the four-digit code, and send it before the clock dies.
            </p>
            <div className="hero-forms">
              <form className="card" aria-label="Create a room" onSubmit={onCreate}>
                <h2>Create a room</h2>
                <label htmlFor="create-name">Agent name</label>
                <input
                  id="create-name"
                  name="name"
                  autoComplete="nickname"
                  maxLength={16}
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  required
                />
                <button className="btn" type="submit" disabled={pending !== null} data-testid="create-room">
                  {pending === 'create' ? 'Creating…' : 'Create room'}
                </button>
              </form>
              <form className="card" aria-label="Join a room" onSubmit={onJoin}>
                <h2>Join a room</h2>
                <label htmlFor="join-code">Room code</label>
                <input
                  id="join-code"
                  name="code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  required
                />
                <label htmlFor="join-name">Agent name</label>
                <input
                  id="join-name"
                  name="name"
                  autoComplete="nickname"
                  maxLength={16}
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  required
                />
                <button className="btn secondary" type="submit" disabled={pending !== null} data-testid="join-room">
                  {pending === 'join' ? 'Joining…' : 'Join room'}
                </button>
              </form>
            </div>
            {error && <Banner tone="error">{error}</Banner>}
            {game.flash && <Banner tone={game.flashTone === 'bad' ? 'error' : 'good'}>{game.flash}</Banner>}
            {game.session && (
              <p className="return-link">
                <Link to={`/room/${game.session.code}`}>Return to room {game.session.code}</Link>
              </p>
            )}
          </div>
          <div className="hero-visual">
            <Art
              src="/assets/mission-control.jpg"
              alt="Mission control desk with cyan waveforms, a countdown ring, and encrypted geometric signals."
              className="hero-art"
            />
            <aside className="preview-card" aria-label="Preview of a mission screen">
              <p className="eyebrow">Preview</p>
              <p className="timer-value preview-time">02:41</p>
              <p className="preview-label">Private fragment</p>
              <p>Example only: the first digit is 1. Your real fragment stays on your screen.</p>
            </aside>
          </div>
        </section>
        <section id="how" className="how-block">
          <div className="section-head">
            <h2>How to play</h2>
            <Link to="/how-to-play">Full briefing</Link>
          </div>
          <RulesContent compact />
        </section>
      </main>
    </>
  )
}
